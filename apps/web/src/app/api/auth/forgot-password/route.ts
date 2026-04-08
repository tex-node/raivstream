import { NextResponse } from 'next/server';
import { prisma } from '@raivstream/database';
import { requestPasswordReset } from '@raivstream/api/src/lib/authService';

export async function POST(req: Request) {
  try {
    const body = await req.json() as { email?: string };
    const email = (body.email ?? '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const result = await requestPasswordReset(prisma, email);

    if (result) {
      const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const resetUrl = `${appUrl}/reset-password?token=${result.rawToken}`;

      // ── Email delivery ────────────────────────────────────────────────────
      // TODO: replace the console.log below with your transactional email
      // provider (Resend, SendGrid, Postmark, etc.) once configured.
      //
      // Example with Resend:
      //   await resend.emails.send({
      //     from: 'Raivstream <noreply@raivstream.com>',
      //     to:   email,
      //     subject: 'Reset your Raivstream password',
      //     html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 1 hour.</p>`,
      //   });
      // ─────────────────────────────────────────────────────────────────────

      console.info(`[auth] Password reset requested for ${email} — reset URL: ${resetUrl}`);
    }

    // Always return 200 regardless of whether the email exists — prevents enumeration
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
