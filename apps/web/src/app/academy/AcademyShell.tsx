'use client';

import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';

export function AcademyShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f4ee] text-[#172033]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-20">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/academy" className="text-sm font-black text-[#2f80ed]">Raivstream Academy</Link>
            <h1 className="mt-1 text-3xl font-black md:text-5xl">{title}</h1>
            {subtitle && <p className="mt-2 max-w-3xl font-semibold text-[#596070]">{subtitle}</p>}
          </div>
          <nav className="flex flex-wrap gap-2 text-sm font-black">
            <Link href="/academy/student" className="rounded-full bg-white px-4 py-2 ring-2 ring-[#172033]/10">Student</Link>
            <Link href="/academy/instructor" className="rounded-full bg-white px-4 py-2 ring-2 ring-[#172033]/10">Instructor</Link>
            <Link href="/academy/classes" className="rounded-full bg-[#172033] px-4 py-2 text-white">Classes</Link>
          </nav>
        </div>
        {children}
      </main>
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border-2 border-[#172033]/10 bg-white p-5 ${className}`}>{children}</section>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border-2 border-dashed border-[#172033]/15 bg-white/60 p-8 text-center font-bold text-[#596070]">{children}</div>;
}

export function dateLabel(value?: string | Date | null) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export function statusLabel(value?: string | null) {
  return (value ?? '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
