/**
 * Hook for discovering the connected user's groups via Sui GraphQL event queries.
 *
 * Queries MemberAdded<Messaging> and MemberRemoved<Messaging> events, then
 * client-side filters by the connected address to compute net group membership.
 *
 * Results are cached in localStorage for instant sidebar render on next load;
 * GraphQL queries refresh in the background.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { SuiGraphQLClient } from '@mysten/sui/graphql';
import {
  useGraphQLClient,
  useMessagingClient,
} from '../contexts/MessagingClientContext';
import {
  getStoredGroups,
  addStoredGroup,
  type StoredGroup,
} from '../lib/group-store';

// ---------------------------------------------------------------------------
// GraphQL query for paginated event discovery
// ---------------------------------------------------------------------------

const DISCOVER_GROUPS_QUERY = `
  query DiscoverGroups($eventType: String!, $cursor: String) {
    events(filter: { eventType: $eventType }, first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        contents {
          json
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Response types matching the GraphQL query shape
// ---------------------------------------------------------------------------

interface EventsQueryResult {
  events: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: Array<{
      contents: {
        json: {
          group_id: string;
          member: string;
        };
      } | null;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Helper: paginate through all events of a given type
// ---------------------------------------------------------------------------

async function queryAllEventGroupIds(
  graphqlClient: SuiGraphQLClient,
  eventType: string,
  memberAddress: string,
): Promise<string[]> {
  const groupIds: string[] = [];
  let cursor: string | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await graphqlClient.query({
      // Cast the string query as any — SuiGraphQLClient accepts GraphQLDocument
      // which gql.tada produces, but a raw string also works at runtime.
      query: DISCOVER_GROUPS_QUERY as unknown as Parameters<typeof graphqlClient.query>[0]['query'],
      variables: { eventType, cursor },
    });

    const data = result.data as EventsQueryResult | undefined;
    const events = data?.events;
    if (!events) break;

    for (const node of events.nodes) {
      const json = node.contents?.json;
      if (!json) continue;

      // Client-side filter: only keep events targeting our address
      if (json.member === memberAddress) {
        groupIds.push(json.group_id);
      }
    }

    if (!events.pageInfo.hasNextPage || !events.pageInfo.endCursor) break;
    cursor = events.pageInfo.endCursor;
  }

  return groupIds;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseGroupDiscoveryResult {
  /** All groups the user belongs to (localStorage cache + GraphQL discovery). */
  groups: StoredGroup[];
  /** Whether a background GraphQL discovery is in progress. */
  loading: boolean;
  /** Manually re-read localStorage and trigger a fresh discovery. */
  refresh: () => void;
}

export function useGroupDiscovery(
  address: string | undefined,
): UseGroupDiscoveryResult {
  const graphqlClient = useGraphQLClient();
  const client = useMessagingClient();

  // Start with cached groups from localStorage
  const [groups, setGroups] = useState<StoredGroup[]>(getStoredGroups);
  const [loading, setLoading] = useState(false);

  // Track the latest address to avoid stale closures
  const addressRef = useRef(address);
  addressRef.current = address;

  const refresh = useCallback(() => {
    setGroups(getStoredGroups());
  }, []);

  useEffect(() => {
    if (!address || !client) {
      setGroups(getStoredGroups());
      return;
    }

    const controller = new AbortController();

    async function discover() {
      setLoading(true);
      try {
        // Get event type strings from the SDK's BCS module.
        // These include the resolved package IDs:
        //   {pkgId}::permissioned_group::MemberAdded<{witnessPkgId}::messaging::Messaging>
        const memberAddedType = client!.groups.bcs.MemberAdded.name;
        const memberRemovedType = client!.groups.bcs.MemberRemoved.name;

        // Paginate through all events of each type
        const [addedGroupIds, removedGroupIds] = await Promise.all([
          queryAllEventGroupIds(graphqlClient, memberAddedType, address!),
          queryAllEventGroupIds(graphqlClient, memberRemovedType, address!),
        ]);

        // Abort check
        if (controller.signal.aborted) return;

        // Compute net membership: added minus removed
        const removedSet = new Set(removedGroupIds);
        const activeGroupIds = [
          ...new Set(addedGroupIds.filter((id) => !removedSet.has(id))),
        ];

        // Merge discovered groups with localStorage
        // (Keep existing names/UUIDs for groups we already know about)
        const stored = getStoredGroups();
        const storedByGroupId = new Map(stored.map((g) => [g.groupId, g]));

        for (const groupId of activeGroupIds) {
          if (!storedByGroupId.has(groupId)) {
            addStoredGroup({
              uuid: '', // UUID unknown for groups discovered via events
              name: `Group ${groupId.slice(0, 8)}...`,
              groupId,
              createdAt: Date.now(),
            });
          }
        }

        if (!controller.signal.aborted) {
          setGroups(getStoredGroups());
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Group discovery failed:', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    discover().then();

    return () => {
      controller.abort();
    };
  }, [address, client, graphqlClient]);

  return { groups, loading, refresh };
}
