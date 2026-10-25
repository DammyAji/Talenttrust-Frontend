export type Cell = string | number | boolean | null | undefined;

// Spreadsheets run cells starting with these as formulas
const FORMULA_START = /^[=+\-@\t\r]/;

export function sanitizeCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

// Only strings are sanitised, so negative numbers stay numeric
function formatCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const s = typeof value === 'string' ? sanitizeCell(value) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((row) => row.map(formatCell).join(',')).join('\r\n');
}
