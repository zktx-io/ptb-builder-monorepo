import { describe, expect, it } from 'vitest';

import { canConnectIO, inferCastTarget } from '../src/ptb/graph/typecheck';
import type { Port, PTBType } from '../src/ptb/graph/types';

const scalar = (
  name: 'address' | 'bool' | 'id' | 'number' | 'string',
): PTBType => ({
  kind: 'scalar',
  name,
});

const moveNumeric = (
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
): PTBType => ({ kind: 'move_numeric', width });

const object = (typeTag?: string): PTBType => ({ kind: 'object', typeTag });
const option = (elem: PTBType): PTBType => ({ kind: 'option', elem });
const vector = (elem: PTBType): PTBType => ({ kind: 'vector', elem });
const canonicalSui =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
const vectorSuiTypeTag = 'vector<0x2::sui::SUI>';
const stringTypeTag = '0x1::string::String';
const objectIdTypeTag = '0x2::object::ID';
const objectUidTypeTag = '0x2::object::UID';
const optionSuiTypeTag = '0x1::option::Option<0x2::sui::SUI>';
const txContextTypeTag = '0x2::tx_context::TxContext';

function out(dataType: PTBType): Port {
  return { id: 'out', role: 'io', direction: 'out', dataType };
}

function input(dataType: PTBType): Port {
  return { id: 'in', role: 'io', direction: 'in', dataType };
}

describe('canConnectIO', () => {
  it.each([
    [scalar('number'), scalar('number'), true],
    [scalar('number'), moveNumeric('u64'), true],
    [moveNumeric('u64'), moveNumeric('u64'), true],
    [moveNumeric('u8'), moveNumeric('u64'), false],
    [object(), object('0x2::sui::SUI'), true],
    [object('0x2::sui::SUI'), object(canonicalSui), true],
    [object('0x2::sui::SUI'), object('0x2::sui::SUI'), true],
    [object('0x2::sui::SUI'), object('0x2::coin::Coin'), false],
    [object('u8'), object('u8'), false],
    [object(), object('u8'), false],
    [object('u8'), object(), false],
    [object(vectorSuiTypeTag), object(vectorSuiTypeTag), false],
    [object(), object(vectorSuiTypeTag), false],
    [object(vectorSuiTypeTag), object(), false],
    [option(scalar('bool')), scalar('bool'), false],
    [option(scalar('number')), option(moveNumeric('u64')), false],
    [vector(scalar('number')), vector(moveNumeric('u64')), false],
    [{ kind: 'unknown' } satisfies PTBType, scalar('bool'), false],
  ])('checks %o -> %o as %s', (sourceType, targetType, expected) => {
    expect(canConnectIO(out(sourceType), input(targetType))).toBe(expected);
  });

  it('requires IO output-to-input direction', () => {
    expect(
      canConnectIO(input(scalar('address')), input(scalar('address'))),
    ).toBe(false);
    expect(
      canConnectIO(
        { id: 'next', role: 'flow', direction: 'out' },
        input(scalar('address')),
      ),
    ).toBe(false);
  });

  it('keeps missing object typeTag leniency at the top-level edge only', () => {
    expect(canConnectIO(out(object()), input(object(canonicalSui)))).toBe(true);
    expect(
      canConnectIO(out(vector(object())), input(vector(object(canonicalSui)))),
    ).toBe(false);
    expect(
      canConnectIO(out(option(object())), input(option(object(canonicalSui)))),
    ).toBe(false);
    expect(
      canConnectIO(
        out(vector(object('0x2::sui::SUI'))),
        input(vector(object(canonicalSui))),
      ),
    ).toBe(true);
    expect(
      canConnectIO(
        out(option(object('0x2::sui::SUI'))),
        input(option(object(canonicalSui))),
      ),
    ).toBe(true);
  });

  it('rejects model-known non-object structs as object type tags', () => {
    [
      stringTypeTag,
      objectIdTypeTag,
      objectUidTypeTag,
      optionSuiTypeTag,
      txContextTypeTag,
    ].forEach((typeTag) => {
      expect(canConnectIO(out(object(typeTag)), input(object(typeTag)))).toBe(
        false,
      );
      expect(canConnectIO(out(object()), input(object(typeTag)))).toBe(false);
      expect(canConnectIO(out(object(typeTag)), input(object()))).toBe(false);
      expect(
        canConnectIO(
          out(vector(object(typeTag))),
          input(vector(object(typeTag))),
        ),
      ).toBe(false);
      expect(
        canConnectIO(
          out(option(object(typeTag))),
          input(option(object(typeTag))),
        ),
      ).toBe(false);
    });
  });

  it('infers casts only for top-level abstract number sources', () => {
    expect(inferCastTarget(scalar('number'), moveNumeric('u64'))).toEqual({
      to: 'u64',
    });
    expect(inferCastTarget(moveNumeric('u64'), scalar('number'))).toBe(
      undefined,
    );
    expect(
      inferCastTarget(option(scalar('number')), option(moveNumeric('u64'))),
    ).toBe(undefined);
    expect(
      inferCastTarget(vector(scalar('number')), vector(moveNumeric('u64'))),
    ).toBe(undefined);
  });
});
