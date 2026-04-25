#!/usr/bin/env node

/**
 * Generate Windows .ico file from PNG source
 *
 * ICO files contain multiple sizes for different display contexts:
 * 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const BUILD_DIR = join(__dirname, '../build');
const INPUT_ICON = join(BUILD_DIR, 'icon.png');
const OUTPUT_ICON = join(BUILD_DIR, 'icon.ico');
const TEMP_DIR = join(BUILD_DIR, 'ico-temp');

// Windows icon sizes
const ICON_SIZES = [16, 32, 48, 64, 128, 256];

/**
 * Generate a single PNG at specified size
 */
async function generatePngSize(sourcePath, size, outputPath) {
  await sharp(sourcePath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outputPath);

  return outputPath;
}

/**
 * Convert multiple PNGs to ICO format
 * ICO format structure: ICONDIR header + ICONDIRENTRY[] + image data
 */
function createIcoFromPngs(pngPaths, outputPath) {
  const images = pngPaths.map(path => readFileSync(path));

  // ICO header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // Reserved (must be 0)
  header.writeUInt16LE(1, 2);      // Type (1 = ICO)
  header.writeUInt16LE(images.length, 4); // Number of images

  // Image directory entries (16 bytes each)
  const entries = [];
  let imageDataOffset = 6 + (images.length * 16);

  images.forEach((imageData, i) => {
    const size = ICON_SIZES[i];
    const entry = Buffer.alloc(16);

    entry.writeUInt8(size === 256 ? 0 : size, 0);  // Width (0 = 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1);  // Height (0 = 256)
    entry.writeUInt8(0, 2);                         // Color palette
    entry.writeUInt8(0, 3);                         // Reserved
    entry.writeUInt16LE(1, 4);                      // Color planes
    entry.writeUInt16LE(32, 6);                     // Bits per pixel
    entry.writeUInt32LE(imageData.length, 8);       // Image data size
    entry.writeUInt32LE(imageDataOffset, 12);       // Image data offset

    entries.push(entry);
    imageDataOffset += imageData.length;
  });

  // Combine all parts
  const icoData = Buffer.concat([
    header,
    ...entries,
    ...images
  ]);

  writeFileSync(outputPath, icoData);
}

async function main() {
  console.log('🎨 Generating Windows .ico file...\n');

  // Check input file
  if (!existsSync(INPUT_ICON)) {
    console.error(`❌ Error: Input icon not found at ${INPUT_ICON}`);
    process.exit(1);
  }

  console.log(`📂 Input:  ${INPUT_ICON}`);
  console.log(`📂 Output: ${OUTPUT_ICON}\n`);

  // Create temp directory
  if (existsSync(TEMP_DIR)) {
    await import('fs').then(fs => fs.promises.rm(TEMP_DIR, { recursive: true }));
  }
  mkdirSync(TEMP_DIR, { recursive: true });

  // Generate all sizes
  console.log('1️⃣  Generating PNG sizes...');
  const pngPaths = [];

  for (const size of ICON_SIZES) {
    const outputPath = join(TEMP_DIR, `icon-${size}.png`);
    await generatePngSize(INPUT_ICON, size, outputPath);
    pngPaths.push(outputPath);
    console.log(`   ✓ ${size}x${size}`);
  }

  // Create ICO file
  console.log('\n2️⃣  Creating .ico file...');
  createIcoFromPngs(pngPaths, OUTPUT_ICON);
  console.log(`   ✓ Created ${OUTPUT_ICON.split('/').pop()}`);

  // Clean up temp directory
  await import('fs').then(fs => fs.promises.rm(TEMP_DIR, { recursive: true }));

  console.log('\n✅ Success! Windows icon generated');
  console.log(`   File: ${OUTPUT_ICON}`);
  console.log('\n🔄 Next steps:');
  console.log('   1. Update package.json to use: "icon": "build/icon.ico"');
  console.log('   2. Rebuild your app: npm run package:win');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
