import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Automarket — Social Media Engine',
  description: 'AI-powered Instagram & YouTube marketing automation for GodParticle',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
