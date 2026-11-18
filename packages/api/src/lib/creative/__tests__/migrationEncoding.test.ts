import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A migration file must be SQL from its first byte (2026-11-18).
 *
 * Six migrations written between 12 and 17 November began with a UTF-8 BOM (`EF BB BF`). Postgres does not treat a BOM as whitespace:
 * `prisma migrate deploy` failed on the first of them with `syntax error at or near "\u{feff}"` (SQLSTATE 42601), which left a failed
 * migration in `_prisma_migrations`, which blocked every migration after it (P3009), which failed the deploy job's migrate step, which
 * skipped the build and the PM2 restart — so production served a build six days old while every PR reported green.
 *
 * The lesson is not "strip the BOM once". Six files acquired one from the same tooling, and the failure is invisible until a deploy
 * reaches the database. This test is the guard: it reads the bytes, not the text, because `readFileSync(path, 'utf8')` keeps the BOM as
 * U+FEFF and would make the check depend on how the reader trims.
 */

const MIGRATIONS_CANDIDATES = [
  join(__dirname, '../../../../../../packages/database/migrations'),
  join(process.cwd(), '../../packages/database/migrations'),
  join(process.cwd(), 'packages/database/migrations'),
];

function migrationsDir(): string {
  const found = MIGRATIONS_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`migrations directory not found; tried:\n${MIGRATIONS_CANDIDATES.join('\n')}`);
  return found;
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function migrationFiles(): Array<{ name: string; path: string }> {
  const root = migrationsDir();
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: join(root, entry.name, 'migration.sql') }))
    .filter((entry) => existsSync(entry.path))
    .sort((left, right) => left.name.localeCompare(right.name));
}

describe('migration files are executable SQL', () => {
  it('no migration.sql begins with a UTF-8 BOM', () => {
    const offending = migrationFiles()
      .filter((file) => readFileSync(file.path).subarray(0, 3).equals(BOM))
      .map((file) => file.name);
    expect(offending).toEqual([]);
  });

  it('every migration directory carries a non-empty migration.sql', () => {
    const root = migrationsDir();
    const missing = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        const path = join(root, entry.name, 'migration.sql');
        return !existsSync(path) || readFileSync(path).length === 0;
      })
      .map((entry) => entry.name);
    expect(missing).toEqual([]);
  });

  it('the first byte of every file is printable ASCII, so a statement starts at position 0', () => {
    const offending = migrationFiles()
      .filter((file) => {
        const first = readFileSync(file.path)[0];
        return first !== undefined && (first < 0x20 || first > 0x7e);
      })
      .map((file) => file.name);
    expect(offending).toEqual([]);
  });
});
