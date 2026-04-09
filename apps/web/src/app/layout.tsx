import { headers } from 'next/headers';
import { Inter } from 'next/font/google';
import { TRPCProvider } from '@/components/providers/TRPCProvider';
import { AuthProvider } from '@/lib/auth';
import { R16Provider } from '@/lib/r16';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Raivstream - Premium Short-Form Video Platform',
  description: 'Discover, create, and share amazing short-form videos',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const isR16 = headersList.get('x-r16-mode') === '1';

  return (
    <html lang="en">
      <body className={inter.className}>
        <TRPCProvider>
          <AuthProvider>
            <R16Provider isR16={isR16}>
              {children}
            </R16Provider>
          </AuthProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
