import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@raivstream/api';

export const trpc = createTRPCReact<AppRouter>();
