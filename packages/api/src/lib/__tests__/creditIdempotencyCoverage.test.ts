/**
 * Phase 1 — credit-idempotency coverage gate.
 *
 * Fails if ANY production `deductCredits` / `refundCredits` call omits its
 * idempotency key (the 6th argument: `(prisma, userId, featureKey, referenceId,
 * description, idempotencyKey?)`). Static AST scan (no regex) so multiline calls
 * are handled correctly.
 *
 * The single documented exception is `routers/director.ts`: its call site has no
 * stable domain id (`referenceId` is `director:${randomUUID()}`), so a
 * deterministic idempotency key cannot be derived — see the Phase-0 baseline
 * report, Appendix B. Add entries here only with a written reason.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/** Paths (relative to `src/`, POSIX) allowed to call without a key, with reason. */
const ALLOWLIST: Record<string, string> = {
  'routers/director.ts': 'no stable domain id at the call site (random UUID referenceId) — flagged in Phase-0 Appendix B',
};

/** The idempotency key is the 6th argument (index 5). */
const REQUIRED_ARGS = 6;
const CALLEES = new Set(['deductCredits', 'refundCredits']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'scripts' || name === 'node_modules') continue;
      walk(p, out);
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
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

function findUnkeyed(file: string, srcText: string): string[] {
  const src = ts.createSourceFile(file, srcText, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && CALLEES.has(calleeName(node)) && node.arguments.length < REQUIRED_ARGS) {
      const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
      hits.push(`${file}:${line + 1} ${calleeName(node)} has ${node.arguments.length} args`);
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return hits;
}

describe('credit idempotency coverage (static)', () => {
  it('every production deductCredits/refundCredits call passes an idempotency key', () => {
    const SRC = join(process.cwd(), 'src');
    const files = walk(SRC).filter(
      (f) =>
        !f.endsWith(join('lib', 'credits.ts')) &&
        !f.endsWith(join('lib', 'credits', 'idempotencyKeys.ts')),
    );

    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      if (ALLOWLIST[rel]) continue;
      offenders.push(...findUnkeyed(rel, readFileSync(file, 'utf8')));
    }

    expect(offenders, `unkeyed credit calls:\n${offenders.join('\n')}`).toEqual([]);
  });
});
