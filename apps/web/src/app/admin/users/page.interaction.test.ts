import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Row-level navigation must not swallow the controls inside the row (2026-11-08).
 *
 * The regression: clicking "⚡ Credits" opened the modal and then navigated to the user detail
 * page, because the `<tr>` has an onClick that pushes `/admin/users/{id}` and the button did not
 * stop propagation. The modal was unmounted before it painted, which from the outside reads as
 * "the credits button opens the user summary page".
 *
 * The same bug sat on the role `<select>` — worse, because the mutation fired and the navigation
 * hid the result. Guard order matters: stopPropagation must run before the action, or the action
 * happens and the row still navigates.
 *
 * This is a source-level test rather than a DOM one: apps/web's vitest runs in a node environment
 * with no jsdom or testing-library, and adding a rendering stack for a two-line fix would be a
 * larger change than the fix.
 */

const PAGE = join(__dirname, 'page.tsx');

describe('the users list row and the controls inside it', () => {
  const source = readFileSync(PAGE, 'utf8');

  it('the row still navigates to the user detail page', () => {
    // CONTRACT CHANGED (2026-11-08): the handler is guarded now, so the exact one-liner is gone.
    // The navigation itself is still the row's job - the guard returns early only for clicks that
    // landed inside an interactive element.
    expect(source).toContain('router.push(`/admin/users/${u.id}`)');
    expect(source).toContain('<tr');
  });

  it('the credits button stops propagation before it opens the modal', () => {
    const buttonStart = source.indexOf('⚡ Credits');
    expect(buttonStart).toBeGreaterThan(-1);

    // The handler immediately preceding the button label.
    const handlerStart = source.lastIndexOf('setCreditModal({ userId: u.id', buttonStart);
    const guardStart = source.lastIndexOf('e.stopPropagation()', handlerStart);
    expect(handlerStart).toBeGreaterThan(-1);
    expect(guardStart).toBeGreaterThan(-1);
    expect(guardStart).toBeLessThan(handlerStart);
  });

  it('the credits button still opens the modal - the fix is not a removal', () => {
    expect(source).toContain('setCreditModal({ userId: u.id, username: u.username, balance: u.creditBalance })');
  });

  it('the role select stops propagation so the mutation result is visible', () => {
    const selectStart = source.indexOf('function RoleSelect');
    expect(selectStart).toBeGreaterThan(-1);
    const block = source.slice(selectStart);
    expect(block).toContain('onClick={(e) => e.stopPropagation()}');
    expect(block).toContain('onChange={(e) => setRole.mutate(');
  });
});

describe('the row-level guard catches elements that forget their own', () => {
  const source = readFileSync(PAGE, 'utf8');

  // #379 fixed the two known cases at the element level. This is the durable half: a third element
  // added to the row must not have to remember a guard, and an element that wants the row's
  // navigation can opt out with [data-no-row-nav].

  it('the row handler checks isInteractive before navigating', () => {
    const guard = source.indexOf('if (isInteractive(e.target)) return;');
    const push = source.indexOf('router.push(`/admin/users/${u.id}`)');
    expect(guard).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(push);
  });

  it('the selector list covers every interactive element the row can hold', () => {
    for (const selector of ['button', 'a', 'select', 'input', 'textarea', '[role="button"]', '[data-no-row-nav]']) {
      expect(source).toContain(selector);
    }
    expect(source).toContain("target.closest('button, a, select, input, textarea, [role=\"button\"], [data-no-row-nav]')");
  });

  it('the guard reads the event target, not a prop or a ref', () => {
    expect(source).toContain('const isInteractive = (target: EventTarget | null) =>');
    expect(source).toContain('target instanceof HTMLElement');
  });

  it('both element-level guards are still present', () => {
    expect(source).toContain('e.stopPropagation();');
    expect(source).toContain('onClick={(e) => e.stopPropagation()}');
  });
});
