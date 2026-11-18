import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A migration must name a TABLE, not a model (2026-11-18).
 *
 * `@@map` renames the table, so the Prisma model name is not a SQL identifier. Two migrations in this repo were written
 * against the model name — `ALTER TABLE "User"` and `ALTER TABLE "CreativeBrief"` — and neither could ever apply:
 * Postgres answered `42P01: relation "User" does not exist`. Because they were unappliable rather than merely unapplied,
 * the columns silently never existed while the schema and the generated client assumed them, and the first client query
 * that selected them died with P2022 (`produce`, service.ts). The same class had already appeared once with
 * `CreativeProductionRun` versus `creative_production_runs`.
 *
 * So the check is not "does the SQL run" — that needs a database, and it failed six days late. It is static: every quoted
 * table a migration touches must be a mapped table name, and specifically must not be a model name whose @@map differs.
 */

const SCHEMA_CANDIDATES = [
  join(__dirname, '../../../../../../packages/database/schema.prisma'),
  join(process.cwd(), '../../packages/database/schema.prisma'),
  join(process.cwd(), 'packages/database/schema.prisma'),
];

const MIGRATIONS_CANDIDATES = [
  join(__dirname, '../../../../../../packages/database/migrations'),
  join(process.cwd(), '../../packages/database/migrations'),
  join(process.cwd(), 'packages/database/migrations'),
];

function find(candidates: string[], label: string): string {
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`${label} not found; tried:\n${candidates.join('\n')}`);
  return found;
}

/** model name -> table name, from `@@map("...")`; an unmapped model keeps its own name. */
function modelToTable(schema: string): Map<string, string> {
  const mapping = new Map<string, string>();
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const match of schema.matchAll(modelPattern)) {
    const [, name, body] = match;
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    mapping.set(name, mapped ? mapped[1] : name);
  }
  return mapping;
}

/** Every quoted identifier a migration uses as a table. */
function tableReferences(sql: string): string[] {
  const pattern = /(?:ALTER TABLE|CREATE TABLE(?:\s+IF NOT EXISTS)?|INSERT INTO|UPDATE|DELETE FROM)\s+"([^"]+)"/g;
  return Array.from(sql.matchAll(pattern), (match) => match[1]);
}

describe('migrations target tables, not Prisma model names', () => {
  const schemaPath = find(SCHEMA_CANDIDATES, 'schema.prisma');
  const migrationsRoot = find(MIGRATIONS_CANDIDATES, 'migrations');
  const mapping = modelToTable(readFileSync(schemaPath, 'utf8'));

  const files = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: join(migrationsRoot, entry.name, 'migration.sql') }))
    .filter((entry) => existsSync(entry.path));

  it('no migration names a model whose table is mapped elsewhere', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const sql = readFileSync(file.path, 'utf8');
      for (const identifier of tableReferences(sql)) {
        const table = mapping.get(identifier);
        if (table && table !== identifier) offenders.push(`${file.name}: "${identifier}" should be "${table}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the mapping is read, not assumed: mapped names differ from their models', () => {
    // A guard that cannot fail is not a guard. These two are the ones a migration got wrong.
    expect(mapping.get('User')).toBe('users');
    expect(mapping.get('CreativeBrief')).toBe('creative_briefs');
  });
});
