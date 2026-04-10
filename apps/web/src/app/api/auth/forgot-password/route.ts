import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@raivstream/database';
import { requestPasswordReset } from '@raivstream/api/src/lib/authService';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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

      if (resend) {
        await resend.emails.send({
          from: 'Raivstream <noreply@raivstream.com>',
          to: email,
          subject: 'Reset your Raivstream password',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a1628;color:#e2e8f0;border-radius:12px">
              <h2 style="margin:0 0 16px;font-size:22px;color:#fff">Reset your password</h2>
              <p style="margin:0 0 24px;color:#94a3b8">We received a request to reset your Raivstream password. Click the button below to choose a new one.</p>
              <a href="${resetUrl}" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Reset password</a>
              <p style="margin:24px 0 0;color:#64748b;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        });
      } else {
        // Fallback for local dev when RESEND_API_KEY is not set
        console.info(`[auth] Password reset URL for ${email}: ${resetUrl}`);
      }
    }

    // Always return 200 regardless of whether the email exists — prevents enumeration
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
