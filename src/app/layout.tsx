import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Florida Annual Report',
  description: 'Automated Florida Annual Report filing platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
