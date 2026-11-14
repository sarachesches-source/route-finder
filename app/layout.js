import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata = {
  title: 'Route Finder',
  description: 'Trail and ultra running loops that hit your distance and climbing targets.',
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
