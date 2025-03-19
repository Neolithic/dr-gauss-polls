import './globals.css';
import { Inter } from 'next/font/google';
import { NextAuthProvider } from '@/app/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Dr Gauss - IPL 25 Polls',
  description: 'App to register your votes for IPL 25',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NextAuthProvider>{children}</NextAuthProvider>
      </body>
    </html>
  );
} 