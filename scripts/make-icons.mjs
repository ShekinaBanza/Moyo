// Generates the PNG icons required for PWA installability from public/icons/icon.svg.
import sharp from 'sharp';

for (const size of [192, 512]) {
    await sharp('public/icons/icon.svg', { density: 300 }).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
// Maskable icon: extra safe-zone padding on a full-bleed background.
await sharp('public/icons/icon.svg', { density: 300 })
    .resize(384, 384)
    .extend({ top: 64, bottom: 64, left: 64, right: 64, background: '#0f766e' })
    .png()
    .toFile('public/icons/icon-maskable-512.png');
console.log('icons generated');
