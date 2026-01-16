// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ClientWithCoreApi } from '@mysten/sui/experimental';

export type PermissionedGroupsPackageConfig = {
	packageId: string;
};

export interface PermissionedGroupsCompatibleClient extends ClientWithCoreApi {}

export interface PermissionedGroupsClientOptions {
	client: PermissionedGroupsCompatibleClient;
}
