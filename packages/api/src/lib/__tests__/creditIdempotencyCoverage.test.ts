/**
 * Phase 1 — credit-idempotency coverage gate.
 *
 * Fails if ANY production credit-write path omits its idempotency key:
 *   - `deductCredits` / `refundCredits` (key is the 6th argument:
 *     `(prisma, userId, featureKey, referenceId, description, idempotencyKey?)`), and
 *   - a direct `creditTransaction.create({ data: { … } })` whose `data` object
 *     does not set `idempotencyKey`.
 *
 * Static AST scan (no regex) so multiline calls are handled correctly. Scans BOTH
 * `packages/api/src` AND `apps/web/src` — the web app owns a direct ledger writer
 * too (the Paystack purchase grant), which an api-only scan would miss.
 *
 * The one documented exception from the Phase-0 baseline report (Appendix B) is
 * gone: `director.ts` now supplies a client idempotency id (commit 656261c), so
 * the allow-list is empty. Add entries here only with a written reason.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';

/** Paths (relative to the scanned root, POSIX) allowed to omit a key, with reason. */
const ALLOWLIST: Record<string, string> = {};

/** The credit-helper key is the 6th argument (index 5). */
const REQUIRED_ARGS = 6;
const CALLEES = new Set(['deductCredits', 'refundCredits']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'scripts' || name === 'node_modules' || name === 'dist' || name === '.next') continue;
      walk(p, out);
    } else if (
      (name.endsWith('.ts') || name.endsWith('.tsx')) &&
      !name.endsWith('.d.ts') &&
      !name.includes('.test.')
    ) {
      out.push(p);
    }
  }
  return out;
}

function calleeName(node: ts.CallExpression): string {
  const expr = node.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return '';
}

/** True for `creditTransaction.create(...)` and `tx.creditTransaction.create(...)`. */
function isCreditTransactionCreate(node: ts.CallExpression): boolean {
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr) || expr.name.text !== 'create') return false;
  const target = expr.expression;
  if (ts.isIdentifier(target)) return target.text === 'creditTransaction';
  if (ts.isPropertyAccessExpression(target)) return target.name.text === 'creditTransaction';
  return false;
}

/** Does `.create({ data: { … } })` provably set `idempotencyKey`? (strict: no spread escape) */
function createHasIdempotencyKey(node: ts.CallExpression): boolean {
  const arg = node.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
  const data = arg.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'data',
  );
  if (!data || !ts.isObjectLiteralExpression(data.initializer)) return false;
  return data.initializer.properties.some((p) => {
    if (ts.isShorthandPropertyAssignment(p)) return p.name.text === 'idempotencyKey';
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text === 'idempotencyKey';
    return false;
  });
}

function findUnkeyed(file: string, srcText: string): string[] {
  const src = ts.createSourceFile(file, srcText, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
      if (CALLEES.has(calleeName(node)) && node.arguments.length < REQUIRED_ARGS) {
        hits.push(`${file}:${line + 1} ${calleeName(node)} has ${node.arguments.length} args`);
      } else if (isCreditTransactionCreate(node) && !createHasIdempotencyKey(node)) {
        hits.push(`${file}:${line + 1} creditTransaction.create without idempotencyKey`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return hits;
}

/** Walk up from the api package to the repo root that owns `apps/web/src`. */
function webSrcRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    const candidate = join(dir, 'apps', 'web', 'src');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

describe('credit idempotency coverage (static)', () => {
  it('every ledger write path passes an idempotency key', () => {
    const roots = [join(process.cwd(), 'src'), webSrcRoot()].filter(
      (r): r is string => Boolean(r) && existsSync(r as string),
    );

    const offenders: string[] = [];
    const scanned: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        if (file.endsWith(join('lib', 'credits.ts'))) continue;
        if (file.endsWith(join('lib', 'credits', 'idempotencyKeys.ts'))) continue;
        const rel = relative(root, file).replace(/\\/g, '/');
        scanned.push(rel);
        if (ALLOWLIST[rel]) continue;
        offenders.push(...findUnkeyed(rel, readFileSync(file, 'utf8')));
      }
    }

    expect(roots.length).toBeGreaterThan(0);
    expect(scanned.length, 'scan produced no files — wrong cwd?').toBeGreaterThan(50);
    expect(offenders, `unkeyed credit writes:\n${offenders.join('\n')}`).toEqual([]);
  });
});
