import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@raivstream/api';
import type { inferRouterOutputs, inferRouterInputs } from '@trpc/server';

export const trpc = createTRPCReact<AppRouter>();

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs  = inferRouterInputs<AppRouter>;
