import type { RawCallArg } from '@zktx.io/ptb-model';
import {
  parseJsonU64,
  parseObjectDigest,
  parseObjectId,
} from '@zktx.io/ptb-model';

export type ObjectOwnerKind =
  | 'AddressOwner'
  | 'ObjectOwner'
  | 'Shared'
  | 'Immutable'
  | 'ConsensusAddressOwner'
  | 'Unknown';

export type ObjectRawUsage =
  | 'object-ref'
  | 'receiving'
  | 'shared-readonly'
  | 'shared-mutable';

export type ObjectAuthoringInfo = {
  objectId: string;
  version: string;
  digest: string;
  typeTag: string;
  ownerKind: ObjectOwnerKind;
  ownerLabel?: string;
  sharedInitialVersion?: string;
};

export type ObjectAuthoringLookupResult =
  | { ok: true; object: ObjectAuthoringInfo }
  | { ok: false; error: string };

type RecordLike = Record<string, unknown>;

export function objectAuthoringInfoFromCoreObject(
  value: unknown,
): ObjectAuthoringLookupResult {
  if (!isRecord(value)) {
    return { ok: false, error: 'Object lookup returned an invalid object.' };
  }

  const objectId = canonicalObjectId(value.objectId);
  const version = canonicalU64(value.version);
  const digest = canonicalObjectDigest(value.digest);
  const typeTag = typeof value.type === 'string' ? value.type : '';
  if (!objectId || !version || !digest) {
    return {
      ok: false,
      error:
        'Object lookup did not return a valid object id, version, and digest.',
    };
  }

  const owner = ownerInfo(value.owner);
  return {
    ok: true,
    object: {
      objectId,
      version,
      digest,
      typeTag,
      ownerKind: owner.kind,
      ownerLabel: owner.label,
      sharedInitialVersion: owner.sharedInitialVersion,
    },
  };
}

export function defaultObjectRawUsage(
  info: ObjectAuthoringInfo,
): ObjectRawUsage | undefined {
  switch (info.ownerKind) {
    case 'AddressOwner':
    case 'ObjectOwner':
    case 'Immutable':
      return 'object-ref';
    case 'Shared':
    case 'ConsensusAddressOwner':
    case 'Unknown':
      return undefined;
  }
}

export function buildObjectRawInputForUsage(
  info: ObjectAuthoringInfo,
  usage: ObjectRawUsage,
): ObjectAuthoringLookupResult & { rawInput?: RawCallArg } {
  switch (usage) {
    case 'object-ref':
      if (info.ownerKind === 'Shared') {
        return {
          ok: false,
          error: 'Shared objects must be authored as shared object inputs.',
        };
      }
      if (info.ownerKind === 'ConsensusAddressOwner') {
        return {
          ok: false,
          error:
            'Consensus-owned objects are not mapped to raw PTB object inputs by this builder.',
        };
      }
      if (info.ownerKind === 'Unknown') {
        return {
          ok: false,
          error:
            'Objects with unknown owner kind cannot become raw PTB inputs.',
        };
      }
      return {
        ok: true,
        object: info,
        rawInput: {
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: info.objectId,
            version: info.version,
            digest: info.digest,
          },
        },
      };
    case 'receiving':
      if (info.ownerKind === 'Shared') {
        return {
          ok: false,
          error: 'Shared objects cannot be authored as Receiving inputs.',
        };
      }
      if (info.ownerKind === 'ConsensusAddressOwner') {
        return {
          ok: false,
          error:
            'Consensus-owned objects are not mapped to Receiving inputs by this builder.',
        };
      }
      if (info.ownerKind === 'Unknown') {
        return {
          ok: false,
          error:
            'Objects with unknown owner kind cannot become Receiving inputs.',
        };
      }
      return {
        ok: true,
        object: info,
        rawInput: {
          kind: 'Object',
          object: {
            kind: 'Receiving',
            objectId: info.objectId,
            version: info.version,
            digest: info.digest,
          },
        },
      };
    case 'shared-readonly':
    case 'shared-mutable':
      if (info.ownerKind !== 'Shared' || !info.sharedInitialVersion) {
        return {
          ok: false,
          error:
            'Only SDK Shared owner objects can become SharedObject raw inputs.',
        };
      }
      return {
        ok: true,
        object: info,
        rawInput: {
          kind: 'Object',
          object: {
            kind: 'SharedObject',
            objectId: info.objectId,
            initialSharedVersion: info.sharedInitialVersion,
            mutable: usage === 'shared-mutable',
          },
        },
      };
  }
}

function ownerInfo(owner: unknown): {
  kind: ObjectOwnerKind;
  label?: string;
  sharedInitialVersion?: string;
} {
  if (!isRecord(owner) || typeof owner.$kind !== 'string') {
    return { kind: 'Unknown' };
  }

  switch (owner.$kind) {
    case 'AddressOwner':
      return {
        kind: 'AddressOwner',
        label:
          typeof owner.AddressOwner === 'string'
            ? owner.AddressOwner
            : undefined,
      };
    case 'ObjectOwner':
      return {
        kind: 'ObjectOwner',
        label:
          typeof owner.ObjectOwner === 'string' ? owner.ObjectOwner : undefined,
      };
    case 'Shared': {
      const shared = isRecord(owner.Shared) ? owner.Shared : undefined;
      const sharedInitialVersion = canonicalU64(shared?.initialSharedVersion);
      return {
        kind: 'Shared',
        sharedInitialVersion,
        label: sharedInitialVersion
          ? `initialSharedVersion ${sharedInitialVersion}`
          : undefined,
      };
    }
    case 'Immutable':
      return { kind: 'Immutable' };
    case 'ConsensusAddressOwner': {
      const consensus = isRecord(owner.ConsensusAddressOwner)
        ? owner.ConsensusAddressOwner
        : undefined;
      return {
        kind: 'ConsensusAddressOwner',
        label:
          typeof consensus?.owner === 'string' ? consensus.owner : undefined,
      };
    }
    case 'Unknown':
      return { kind: 'Unknown' };
    default:
      return { kind: 'Unknown' };
  }
}

function canonicalObjectId(value: unknown): string | undefined {
  return parseObjectId(value);
}

function canonicalU64(value: unknown): string | undefined {
  return parseJsonU64(value);
}

function canonicalObjectDigest(value: unknown): string | undefined {
  return parseObjectDigest(value);
}

function isRecord(value: unknown): value is RecordLike {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
