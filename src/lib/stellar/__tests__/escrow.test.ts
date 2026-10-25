import {
  formatStroops,
  extractContractErrorCode,
  CONTRACT_ERRORS,
} from '../escrow';

describe('formatStroops', () => {
  it('formats whole XLM', () => expect(formatStroops(10_000_000n)).toBe('1.0'));
  it('formats minimum stroop', () => expect(formatStroops(1n)).toBe('0.0000001'));
  it('formats zero', () => expect(formatStroops(0n)).toBe('0.0'));
  it('formats 10 XLM', () => expect(formatStroops(100_000_000n)).toBe('10.0'));
  it('trims trailing zeros', () => expect(formatStroops(10_500_000n)).toBe('1.05'));
  it('preserves all 7 decimals when needed', () =>
    expect(formatStroops(10_000_001n)).toBe('1.0000001'));
});

describe('extractContractErrorCode', () => {
  it('extracts code 5', () =>
    expect(extractContractErrorCode('Error(Contract, #5)')).toBe(5));
  it('extracts code 13', () =>
    expect(extractContractErrorCode('Error(Contract, #13)')).toBe(13));
  it('returns null for unrecognised string', () =>
    expect(extractContractErrorCode('unknown error')).toBeNull());
  it('returns null for empty string', () =>
    expect(extractContractErrorCode('')).toBeNull());
});

describe('CONTRACT_ERRORS', () => {
  it('maps 5 → ContractNotFound', () => expect(CONTRACT_ERRORS[5]).toBe('ContractNotFound'));
  it('maps 10 → InvalidStatus', () => expect(CONTRACT_ERRORS[10]).toBe('InvalidStatus'));
  it('maps 12 → MilestoneAlreadyReleased', () =>
    expect(CONTRACT_ERRORS[12]).toBe('MilestoneAlreadyReleased'));
  it('maps 13 → InsufficientFunds', () =>
    expect(CONTRACT_ERRORS[13]).toBe('InsufficientFunds'));
  it('maps 9 → OverFunded', () => expect(CONTRACT_ERRORS[9]).toBe('OverFunded'));
});
