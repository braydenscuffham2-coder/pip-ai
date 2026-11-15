import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { BRAND } from '@/lib/knowledge';
import './globals.css';

// Google Analytics 4 measurement ID (public, it ships in the page source).
// NEXT_PUBLIC_GA_ID on Vercel overrides it.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-2NQP6ZH74T';

export const metadata: Metadata = {
  title: `${BRAND} · The AI marketplace built around your business`,
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
      <body>
        {children}
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="ga-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
        </Script>
      </body>
    </html>
  );
}
