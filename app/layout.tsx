import type { Metadata } from 'next';
import { Lora, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const lora = Lora({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: 'artifact.host — Share what your AI built',
  description: 'Paste your AI’s HTML, get a live link. One MCP call. Expires when you want.',
  openGraph: {
    title: 'artifact.host',
    description: 'Share what your AI built. One tool call from your agent.',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${lora.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
