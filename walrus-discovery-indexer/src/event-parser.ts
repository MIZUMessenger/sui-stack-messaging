import { bcs } from '@mysten/sui/bcs';
import { blobIdFromInt } from '@mysten/walrus';
import type { GrpcTypes } from '@mysten/sui/grpc';

// BCS layout matching walrus::events::BlobCertified — field order must match the Move struct.
const BlobCertifiedBcs = bcs.struct('BlobCertified', {
  epoch: bcs.u32(),
  blob_id: bcs.u256(),
  end_epoch: bcs.u32(),
  deletable: bcs.bool(),
  object_id: bcs.Address,
  is_extension: bcs.bool(),
});

export interface ParsedBlobEvent {
  blobId: string;
  objectId: string;
  endEpoch: number;
}

// Parse a gRPC event as a Walrus BlobCertified event, returns null if it doesn't match.
export function parseWalrusEvent(
  event: GrpcTypes.Event,
  walrusPackageId: string,
): ParsedBlobEvent | null {
  const normalizedPkg = walrusPackageId.replace(/^0x/, '').toLowerCase();
  const eventType = event.eventType?.toLowerCase() ?? '';
  if (!eventType.includes(normalizedPkg) || !eventType.includes('blobcertified')) {
    return null;
  }

  const bcsBytes = event.contents?.value;
  if (!bcsBytes) return null;

  try {
    const decoded = BlobCertifiedBcs.parse(new Uint8Array(bcsBytes));
    const blobId = blobIdFromInt(decoded.blob_id);
    const objectId = typeof decoded.object_id === 'string'
      ? decoded.object_id
      : '0x' + Buffer.from(decoded.object_id as Uint8Array).toString('hex');

    return { blobId, objectId, endEpoch: decoded.end_epoch };
  } catch {
    return null;
  }
}
