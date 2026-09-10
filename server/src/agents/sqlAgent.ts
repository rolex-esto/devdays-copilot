import Database from 'better-sqlite3';
import type { Dataset } from '../types.js';
import type { AgentContext, AgentResult, Evidence } from './types.js';

export const SQL_MAX_LENGTH = 2_000;
export const SQL_MAX_ROWS = 500;
export const SQL_DEFAULT_TIMEOUT_MS = 1_000;
export const SQL_MAX_TIMEOUT_MS = 5_000;
const SQL_FORBIDDEN = /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|reindex|replace|transaction|begin|commit|rollback|savepoint|release|load_extension)\b/i;

export interface SqlQueryResult {
  sql: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  schema: Array<{ name: string; type: string }>;
  elapsedMs: number;
}

export class SqlValidationError extends Error {
  code: 'SQL_VALIDATION' | 'SQL_TIMEOUT' | 'SQL_TOO_MANY_ROWS';

  constructor(message: string, code: SqlValidationError['code'] = 'SQL_VALIDATION') {
    super(message);
    this.name = 'SqlValidationError';
    this.code = code;
  }
}

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

export const validateReadOnlySql = (sql: string, dataset: Dataset, maxLength = SQL_MAX_LENGTH) => {
  const normalized = sql.trim();
  if (!normalized) throw new SqlValidationError('A SQL query is required.');
  if (normalized.length > maxLength) throw new SqlValidationError(`SQL query exceeds the ${maxLength}-character limit.`);
  if (/--|\/\*/.test(normalized)) throw new SqlValidationError('SQL comments are not allowed.');
  const withoutTrailingSemicolon = normalized.endsWith(';') ? normalized.slice(0, -1).trim() : normalized;
  if (withoutTrailingSemicolon.includes(';')) throw new SqlValidationError('Only one SQL statement is allowed.');
  const explain = /^explain(?:\s+query\s+plan)?\s+/i.test(withoutTrailingSemicolon);
  const readStatement = explain
    ? withoutTrailingSemicolon.replace(/^explain(?:\s+query\s+plan)?\s+/i, '')
    : withoutTrailingSemicolon;
  if (!/^(select|with)\b/i.test(readStatement)) {
    throw new SqlValidationError('Only read-only SELECT, WITH, or EXPLAIN queries are allowed.');
  }
  if (SQL_FORBIDDEN.test(readStatement) || /\bwith\s+recursive\b/i.test(readStatement)) {
    throw new SqlValidationError('The query contains a disallowed SQL operation.');
  }
  const referencedTables = [...readStatement.matchAll(/\b(?:from|join)\s+["`]?([a-z_][\w]*)["`]?/gi)].map((match) => match[1].toLowerCase());
  if (!referencedTables.length || referencedTables.some((table) => table !== 'dataset')) {
    throw new SqlValidationError('Queries must read from the grounded dataset table.');
  }
  if (/\bsqlite_|information_schema|pragma\b/i.test(readStatement)) throw new SqlValidationError('System tables are not part of the grounded schema.');
  if (/\bcross\s+join\b/i.test(readStatement)) throw new SqlValidationError('CROSS JOIN is not allowed.');
  const knownColumns = new Set(Object.keys(dataset.records.reduce<Record<string, unknown>>((all, row) => ({ ...all, ...row }), {})));
  return { sql: withoutTrailingSemicolon, knownColumns, explain };
};

const buildSchema = (dataset: Dataset) => {
  const keys = [...new Set(dataset.records.flatMap((record) => Object.keys(record)))];
  return keys.map((name) => ({ name, type: 'TEXT' }));
};

export const executeReadOnlySql = (
  sql: string,
  dataset: Dataset,
  options: { maxRows?: number; timeoutMs?: number } = {}
): SqlQueryResult => {
  const maxRows = options.maxRows ?? SQL_MAX_ROWS;
  const timeoutMs = options.timeoutMs ?? SQL_DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > SQL_MAX_ROWS) throw new SqlValidationError(`maxRows must be between 1 and ${SQL_MAX_ROWS}.`);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > SQL_MAX_TIMEOUT_MS) {
    throw new SqlValidationError(`timeoutMs must be between 1 and ${SQL_MAX_TIMEOUT_MS}ms.`);
  }
  const validated = validateReadOnlySql(sql, dataset);
  const schema = buildSchema(dataset);
  const queryDb = new Database(':memory:');
  try {
    const columns = schema.length ? schema : [{ name: '_row_number', type: 'INTEGER' }];
    queryDb.exec(`CREATE TABLE dataset (${columns.map((column) => `${quoteIdentifier(column.name)} ${column.type}`).join(', ')})`);
    const insert = queryDb.prepare(`INSERT INTO dataset (${columns.map((column) => quoteIdentifier(column.name)).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
    const transaction = queryDb.transaction(() => {
      dataset.records.forEach((record, index) => insert.run(...columns.map((column) => column.name === '_row_number' ? index + 1 : record[column.name] ?? null)));
    });
    transaction();
    const started = Date.now();
    let rows: Array<Record<string, unknown>>;
    try {
      const statement = queryDb.prepare(validated.sql);
      rows = statement.all() as Array<Record<string, unknown>>;
      const columns = statement.columns().map((column) => column.name);
      const elapsedMs = Date.now() - started;
      if (elapsedMs > timeoutMs) throw new SqlValidationError(`SQL query exceeded the ${timeoutMs}ms timeout.`, 'SQL_TIMEOUT');
      if (rows.length > maxRows) throw new SqlValidationError(`SQL query returned more than the ${maxRows}-row limit.`, 'SQL_TOO_MANY_ROWS');
      return { sql: validated.sql, columns, rows, rowCount: rows.length, schema, elapsedMs };
    } catch (error) {
      if (error instanceof SqlValidationError) throw error;
      throw new SqlValidationError(error instanceof Error ? `SQL query is invalid: ${error.message}` : 'SQL query is invalid.');
    }
  } finally {
    queryDb.close();
  }
};

const queryForPrompt = (prompt: string, dataset: Dataset) => {
  const columns = [...new Set(dataset.records.flatMap((record) => Object.keys(record)))];
  const numeric = columns.find((column) => /(revenue|sales|amount|total|price|cost|value|quantity|qty)/i.test(column)
    && dataset.records.some((record) => typeof record[column] === 'number' || (typeof record[column] === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(record[column]))))
    ?? columns.find((column) => dataset.records.some((record) => typeof record[column] === 'number'));
  const category = columns.find((column) => /(payment|method|product|item|category|status|type|name)/i.test(column)
    && dataset.records.some((record) => typeof record[column] === 'string'))
    ?? columns.find((column) => dataset.records.some((record) => typeof record[column] === 'string'));
  const lower = prompt.toLowerCase();
  if (numeric && category && /\b(most|highest|top|best|generated|revenue|sales)\b/.test(lower)) {
    return `SELECT "${category}", SUM(CAST("${numeric}" AS REAL)) AS total_${numeric} FROM dataset GROUP BY "${category}" ORDER BY total_${numeric} DESC LIMIT 1`;
  }
  if (numeric && /\b(average|avg|mean)\b/.test(lower)) return `SELECT ${category ? `"${category}", ` : ''}AVG("${numeric}") AS average_${numeric}${category ? ` FROM dataset GROUP BY "${category}"` : ' FROM dataset'}`;
  if (numeric && /\b(sum|total)\b/.test(lower)) return `SELECT ${category ? `"${category}", ` : ''}SUM("${numeric}") AS total_${numeric}${category ? ` FROM dataset GROUP BY "${category}"` : ' FROM dataset'}`;
  if (/\b(count|how many|number of)\b/.test(lower)) return category ? `SELECT "${category}", COUNT(*) AS count FROM dataset GROUP BY "${category}"` : 'SELECT COUNT(*) AS count FROM dataset';
  return 'SELECT * FROM dataset LIMIT 500';
};

export const runSqlAgent = (context: AgentContext, sql?: string): AgentResult => {
  if (!context.dataset) return { agentId: 'sql', status: 'blocked', summary: 'A dataset is required for SQL analysis.', evidence: [], errors: ['datasetId is required'] };
  const selectedSql = sql ?? queryForPrompt(context.task.userRequest, context.dataset);
  try {
    const result = executeReadOnlySql(selectedSql, context.dataset);
    const evidence: Evidence[] = [
      { kind: 'sql', summary: 'Read-only SQL executed against the grounded dataset schema.', value: result.sql },
      { kind: 'sql_result', summary: `${result.rowCount} verified row${result.rowCount === 1 ? '' : 's'} returned.`, value: { columns: result.columns, rows: result.rows, rowCount: result.rowCount, schema: result.schema, elapsedMs: result.elapsedMs } }
    ];
    return { agentId: 'sql', status: 'success', summary: `Executed a read-only query and returned ${result.rowCount} row${result.rowCount === 1 ? '' : 's'}.`, evidence };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SQL execution failed.';
    return { agentId: 'sql', status: 'failed', summary: message, evidence: [], errors: [message] };
  }
};
