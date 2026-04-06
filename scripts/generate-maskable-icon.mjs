import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

// Theme color background: #0f172a (dark navy)
const BG = { r: 15, g: 23, b: 42, alpha: 1 };

async function generateMaskable(srcFile, outFile, size) {
  // Safe zone = 80% of total size → icon fits inside that
  const safeSize = Math.round(size * 0.78);

  // 1. Resize the source icon to safeSize
  const iconBuffer = await sharp(srcFile)
    .resize(safeSize, safeSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // 2. Create a flat background at full size
  const offset = Math.round((size - safeSize) / 2);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: BG.r, g: BG.g, b: BG.b, alpha: 255 },
    },
  })
    .composite([{ input: iconBuffer, top: offset, left: offset }])
    .png()
    .toFile(outFile);

  console.log(`✅ Generated: ${outFile} (${size}×${size})`);
}

await generateMaskable(
  path.join(publicDir, 'icon-512.png'),
  path.join(publicDir, 'icon-512-maskable.png'),
  512
);

await generateMaskable(
  path.join(publicDir, 'icon-192.png'),
  path.join(publicDir, 'icon-192-maskable.png'),
  192
);

console.log('🎉 Maskable icons generated successfully!');
