import { Inter } from 'next/font/google';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

// Inter, served from this app (Next.js downloads it once at build time). latin-ext covers
// Romanian and other European place names (ă, ș, ő ...).
const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--font-inter' });

export const metadata = {
  title: 'Hillgorithm · Loops built to your climb',
  description: 'Trail and ultra running loops that hit your distance and climbing targets.',
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
