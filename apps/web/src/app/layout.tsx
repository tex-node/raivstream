import { Inter } from 'next/font/google';
import { TRPCProvider } from '@/components/providers/TRPCProvider';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Raivstream - Premium Short-Form Video Platform',
  description: 'Discover, create, and share amazing short-form videos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TRPCProvider>
          <AuthProvider>{children}</AuthProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
