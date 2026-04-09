'use client';

/**
 * R16 mode context — detects when the site is served from r16.raivstream.com
 * (kids-safe feed). Passed from the root layout (server) into this provider
 * (client) so all components can read it with useR16().
 */

import { createContext, useContext } from 'react';

const R16Context = createContext(false);

export function R16Provider({
  isR16,
  children,
}: {
  isR16: boolean;
  children: React.ReactNode;
}) {
  return <R16Context.Provider value={isR16}>{children}</R16Context.Provider>;
}

/** Returns true when we're on r16.raivstream.com (kids mode). */
export function useR16() {
  return useContext(R16Context);
}
