import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SIZES = [16, 32, 48, 64, 128, 256, 512];
const BUILD_DIR = join(__dirname, '../build');
const ICONS_DIR = join(BUILD_DIR, 'icons');
const INPUT_ICON = join(BUILD_DIR, 'icon.png');

if (!existsSync(ICONS_DIR)) {
  mkdirSync(ICONS_DIR, { recursive: true });
}

console.log('🐧 Generating Linux icons...\n');

for (const size of SIZES) {
  const outputPath = join(ICONS_DIR, `${size}x${size}.png`);
  await sharp(INPUT_ICON)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath);
  console.log(`   ✓ ${size}x${size}`);
}

console.log('\n✅ Linux icons generated in build/icons/');
