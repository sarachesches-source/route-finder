// MapLibre runs map work in a background "worker" file. Next.js bundling hides it,
// so we copy it to public/ where the browser can load it (see MapView.js).
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public', { recursive: true });
copyFileSync('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', 'public/maplibre-gl-worker.mjs');
console.log('Copied MapLibre worker to public/');
