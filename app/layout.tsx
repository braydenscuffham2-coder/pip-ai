import type { Metadata, Viewport } from 'next';
import { BRAND } from '@/lib/knowledge';
import './globals.css';

export const metadata: Metadata = {
  title: `Pip · ${BRAND}`,
  description: 'Give Pip your website. It finds the AI your business is missing and shows it working on your business.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Unbounded:wght@500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
