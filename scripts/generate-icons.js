/**
 * Generate app icons from favicon.jpg
 * Creates icon.png for all platforms and icon.ico for Windows
 * - Crops to square, centers and enlarges the R
 * - Adds rounded corners
 * - Transparent background
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SOURCE = path.join(__dirname, '../docs/favicon.jpg');
const BUILD_DIR = path.join(__dirname, '../build');

/**
 * Create a rounded rectangle mask SVG
 */
function createRoundedMask(size, radius) {
  return Buffer.from(`
    <svg width="${size}" height="${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>
  `);
}

async function generateIcons() {
  // Ensure build directory exists
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  console.log('Generating icons from:', SOURCE);

  // Get source dimensions
  const metadata = await sharp(SOURCE).metadata();
  console.log(`Source: ${metadata.width}x${metadata.height}`);

  // Source is 1600x896 - extract center square focusing on the R
  // The R is centered, so we'll extract a square from the center
  const squareSize = Math.min(metadata.width, metadata.height); // 896
  const left = Math.floor((metadata.width - squareSize) / 2); // Center horizontally
  const top = 0; // Start from top since height is the limiting factor

  // Extract square region and resize to 512
  const baseSize = 512;
  const cornerRadius = Math.round(baseSize * 0.18); // ~18% radius for rounded corners

  // Step 1: Extract square, resize larger to make R bigger (cover more area)
  const squareBuffer = await sharp(SOURCE)
    .extract({ left, top, width: squareSize, height: squareSize })
    .resize(baseSize, baseSize, { fit: 'cover' })
    .png()
    .toBuffer();

  // Step 2: Apply rounded corners using composite with mask
  const roundedMask = createRoundedMask(baseSize, cornerRadius);
  
  await sharp(squareBuffer)
    .composite([{
      input: roundedMask,
      blend: 'dest-in' // Keep only where mask is white
    }])
    .png()
    .toFile(path.join(BUILD_DIR, 'icon.png'));
  console.log('Created: build/icon.png (512x512 with rounded corners)');

  // Generate multiple sizes for .ico file (Windows needs these)
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  
  for (const size of icoSizes) {
    const iconPath = path.join(BUILD_DIR, `icon-${size}.png`);
    const radius = Math.round(size * 0.18);
    const mask = createRoundedMask(size, radius);
    
    // Resize the base square image
    const resizedBuffer = await sharp(squareBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    
    // Apply rounded corners
    await sharp(resizedBuffer)
      .composite([{
        input: mask,
        blend: 'dest-in'
      }])
      .png()
      .toFile(iconPath);
  }
  console.log('Created: icon PNGs for all sizes with rounded corners');

  // Generate Windows .ico file from the 256px PNG
  const pngToIcoModule = require('png-to-ico');
  const pngToIco = pngToIcoModule.default || pngToIcoModule;
  const icon256Path = path.join(BUILD_DIR, 'icon-256.png');
  const icoBuffer = await pngToIco(icon256Path);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuffer);
  console.log('Created: build/icon.ico');

  console.log('\nIcon generation complete!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
