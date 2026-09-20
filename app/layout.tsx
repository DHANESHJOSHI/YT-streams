import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fluid Live Studio - Cloud Broadcast & RTMP Streamer',
  description: 'Professional Web Studio for streaming Cloudflare R2 & local videos to YouTube Live 24/7',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0b0f] text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
