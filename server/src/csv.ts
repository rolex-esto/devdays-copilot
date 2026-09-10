import type { DatasetRecord } from './types.js';

export interface ParsedCsv {
  headers: string[];
  records: DatasetRecord[];
}

const parseCsvRows = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) {
    throw new Error('The CSV contains an unfinished quoted value.');
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
};

const coerceValue = (value: string): string | number | boolean | null => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
};

export const parseCsv = (input: string): ParsedCsv => {
  const rows = parseCsvRows(input.replace(/^\uFEFF/, ''));
  if (rows.length === 0) {
    throw new Error('The CSV file is empty.');
  }

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => header === '')) {
    throw new Error('Every CSV column needs a name.');
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error('CSV column names must be unique.');
  }

  const records = rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`Row ${rowIndex + 2} has ${values.length} values; expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, coerceValue(values[index])]));
  });

  return { headers, records };
};
