import { describe, expect, it } from 'vitest';
import { Cell, sanitizeCell, toCsv } from '@/lib/csv';

describe('sanitizeCell', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+cmd', "'+cmd"],
    ['-2', "'-2"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tx', "'\tx"],
    ['\rx', "'\rx"],
    ['plain', 'plain'],
    ['a=b', 'a=b'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeCell(input)).toBe(expected);
  });
});

describe('toCsv', () => {
  const one = (cell: Cell) => toCsv(['h'], [[cell]]).slice('h\r\n'.length);

  it('joins records with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [2, 'y']])).toBe('a,b\r\n1,x\r\n2,y');
  });

  it.each([
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
    ['cr\r\nhere', '"cr\r\nhere"'],
    ['Логотип café 🚀', 'Логотип café 🚀'],
    ['=1+1, "quoted"', `"'=1+1, ""quoted"""`],
    ['@x', "'@x"],
    ['\rx', `"'\rx"`],
  ])('quotes and sanitises string %j', (input, expected) => {
    expect(one(input)).toBe(expected);
  });

  it('keeps numbers numeric, negatives included', () => {
    expect(toCsv(['n'], [[-5], [0], [12.5]])).toBe('n\r\n-5\r\n0\r\n12.5');
  });

  it('writes empty cells for null, undefined and non-finite numbers', () => {
    expect(toCsv(['a', 'b', 'c', 'd'], [[null, undefined, NaN, Infinity]])).toBe('a,b,c,d\r\n,,,');
  });

  it('writes booleans as true/false', () => {
    expect(toCsv(['b'], [[true], [false]])).toBe('b\r\ntrue\r\nfalse');
  });

  it('escapes headers too', () => {
    expect(toCsv(['a,b', '=x'], [])).toBe(`"a,b",'=x`);
  });

  it('exports =HYPERLINK as literal text', () => {
    expect(one('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
  });
});
