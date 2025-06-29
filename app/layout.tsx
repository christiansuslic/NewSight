import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AccessWeb AI - Voice-First Assistant',
  description: 'Voice-first assistant for people with disabilities to consume and interact with news and web content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}