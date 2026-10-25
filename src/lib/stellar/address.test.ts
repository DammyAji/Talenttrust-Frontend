import { describe, expect, it } from 'vitest';
import { normalizeAddress, validateAddress } from './address';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const CONTRACT = 'CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W';

describe('normalizeAddress', () => {
  it('trims whitespace, strips zero-width characters and uppercases', () => {
    expect(normalizeAddress(`  g\u200bAAAA\u200dAAA\ufeffWHF  `)).toBe('GAAAAAAAWHF');
  });
});

describe('validateAddress', () => {
  it('accepts a real G account address', () => {
    expect(validateAddress(ACCOUNT)).toEqual({ ok: true, value: ACCOUNT });
  });

  it('accepts a real C contract address when contracts are allowed', () => {
    expect(validateAddress(CONTRACT, { allow: ['account', 'contract'] })).toEqual({ ok: true, value: CONTRACT });
  });

  it('rejects contract addresses when only accounts are allowed', () => {
    expect(validateAddress(CONTRACT)).toMatchObject({ ok: false, reason: 'prefix' });
  });

  it('rejects a one-character mutation with a checksum error', () => {
    const mutated = `${ACCOUNT.slice(0, -1)}X`;
    expect(validateAddress(mutated)).toMatchObject({ ok: false, reason: 'checksum' });
  });

  it('rejects the wrong length', () => {
    expect(validateAddress(ACCOUNT.slice(0, -1))).toMatchObject({ ok: false, reason: 'length' });
  });

  it('accepts lowercase input after normalisation', () => {
    expect(validateAddress(ACCOUNT.toLowerCase())).toEqual({ ok: true, value: ACCOUNT });
  });

  it('accepts an embedded zero-width space after normalisation', () => {
    const withZeroWidth = `${ACCOUNT.slice(0, 20)}\u200b${ACCOUNT.slice(20)}`;
    expect(validateAddress(withZeroWidth)).toEqual({ ok: true, value: ACCOUNT });
  });

  it('rejects muxed addresses with a dedicated reason', () => {
    expect(validateAddress(`M${'A'.repeat(68)}`)).toMatchObject({ ok: false, reason: 'muxed-unsupported' });
  });

  it('rejects empty input', () => {
    expect(validateAddress(' \u200b ')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('rejects an unknown prefix', () => {
    expect(validateAddress(`X${'A'.repeat(55)}`)).toMatchObject({ ok: false, reason: 'prefix' });
  });

  it('rejects invalid base32 characters', () => {
    expect(validateAddress(`${ACCOUNT.slice(0, -1)}!`)).toMatchObject({ ok: false, reason: 'charset' });
  });
});
