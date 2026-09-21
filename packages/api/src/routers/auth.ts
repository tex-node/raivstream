/**
 * tRPC auth router — used by mobile clients (Expo/React Native).
 *
 * Web clients use the dedicated /api/auth/* Next.js API routes (which set
 * httpOnly cookies). Mobile clients receive tokens in the response body and
 * store them in expo-secure-store via the Zustand auth store.
 *
 * All business logic (lockout, token rotation, timing-safe comparisons) lives
 * in authService.ts and is shared between this router and the web API routes.
 */

import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  registerUser,
  loginUser,
  googleAuthUser,
  refreshTokens,
  logoutUser,
  logoutAllDevices,
} from '../lib/authService';

/** Map authService error codes to TRPCError codes */
function toTRPCError(err: unknown): never {
  const e = err as Error & { code?: string };
  const code = ((): TRPCError['code'] => {
    switch (e.code) {
      case 'CONFLICT':          return 'CONFLICT';
      case 'UNAUTHORIZED':      return 'UNAUTHORIZED';
      case 'TOO_MANY_REQUESTS': return 'TOO_MANY_REQUESTS';
      default:                  return 'INTERNAL_SERVER_ERROR';
    }
  })();
  throw new TRPCError({ code, message: e.message });
}

export const authRouter = router({

  register: publicProcedure
    .input(z.object({
      email:       z.string().email().max(254),
      password:    z.string().min(8).max(128),
      username:    z.string().min(3).max(30).regex(
        /^[a-z0-9_]+$/,
        'Username must be lowercase letters, numbers, or underscores'
      ).toLowerCase(),
      displayName: z.string().min(1).max(50).trim(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await registerUser(ctx.prisma, input);
      } catch (err) {
        toTRPCError(err);
      }
    }),

  login: publicProcedure
    .input(z.object({
      email:    z.string().email().max(254).toLowerCase(),
      password: z.string().max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await loginUser(ctx.prisma, input);
      } catch (err) {
        toTRPCError(err);
      }
    }),

  google: publicProcedure
    .input(z.object({
      idToken: z.string().min(1).max(8192),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await googleAuthUser(ctx.prisma, input.idToken);
      } catch (err) {
        toTRPCError(err);
      }
    }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await refreshTokens(ctx.prisma, input.refreshToken);
      } catch (err) {
        toTRPCError(err);
      }
    }),

  logout: protectedProcedure
    .input(z.object({ refreshToken: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await logoutUser(ctx.prisma, ctx.user.id, input.refreshToken);
      return { success: true };
    }),

  logoutAll: protectedProcedure.mutation(async ({ ctx }) => {
    await logoutAllDevices(ctx.prisma, ctx.user.id);
    return { success: true };
  }),
});
