export type AddressKind = 'account' | 'contract';

export type AddressReason = 'empty' | 'length' | 'prefix' | 'charset' | 'checksum' | 'muxed-unsupported';

export interface ValidateAddressOptions {
  allow?: AddressKind[];
}

export type AddressValidation =
  | { ok: true; value: string }
  | { ok: false; reason: AddressReason; message: string };

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_PATTERN = /^[A-Z2-7]+$/;
const ZERO_WIDTH_PATTERN = /[\u200b-\u200d\u2060\ufeff]/g;

const STRKEY_VERSION: Record<AddressKind, number> = {
  account: 6 << 3,
  contract: 2 << 3,
};

const PREFIX_KIND: Record<string, AddressKind> = {
  G: 'account',
  C: 'contract',
};

const messages: Record<AddressReason, string> = {
  empty: 'Enter a Stellar address.',
  length: 'Stellar addresses must be 56 characters long.',
  prefix: 'Address must start with G for an account or C for a contract.',
  charset: 'Address contains invalid characters. Stellar addresses use only A-Z and 2-7.',
  checksum: 'Address checksum is invalid. Check the address for typos.',
  'muxed-unsupported': 'Muxed (M...) addresses are not supported. Use the underlying G... account address.',
};

export function normalizeAddress(raw: string): string {
  return raw.replace(ZERO_WIDTH_PATTERN, '').trim().toUpperCase();
}

function fail(reason: AddressReason, message = messages[reason]): AddressValidation {
  return { ok: false, reason, message };
}

function crc16XModem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

function base32Decode(input: string): Uint8Array {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of input) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }

  return Uint8Array.from(bytes);
}

export function validateAddress(raw: string, options: ValidateAddressOptions = {}): AddressValidation {
  const allow = options.allow ?? ['account'];
  const value = normalizeAddress(raw);

  if (value.length === 0) return fail('empty');
  if (value.startsWith('M')) return fail('muxed-unsupported');
  if (value.length !== 56) return fail('length');

  const kind = PREFIX_KIND[value[0]];
  if (!kind) return fail('prefix');
  if (!allow.includes(kind)) {
    return fail('prefix', allow.includes('contract') ? messages.prefix : 'Only G... account addresses are supported.');
  }

  if (!BASE32_PATTERN.test(value)) return fail('charset');

  const decoded = base32Decode(value);
  if (decoded.length !== 35) return fail('length');
  if (decoded[0] !== STRKEY_VERSION[kind]) return fail('prefix');

  const expected = decoded[33] | (decoded[34] << 8);
  const actual = crc16XModem(decoded.subarray(0, 33));
  if (expected !== actual) return fail('checksum');

  return { ok: true, value };
}
