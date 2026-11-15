const fs = require('fs');
const path = require('path');

function createIco() {
  const width = 32;
  const height = 32;
  const bpp = 32; // 32-bit RGBA

  // Allocate pixel buffer (32x32 RGBA in BGRA format, bottom-to-top)
  const pixels = Buffer.alloc(width * height * 4, 0);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    // In BMP, row 0 is the bottom row
    const bmpY = (height - 1 - y);
    const offset = (bmpY * width + x) * 4;
    pixels[offset] = b;
    pixels[offset + 1] = g;
    pixels[offset + 2] = r;
    pixels[offset + 3] = a;
  }

  // Draw 32x32 icon
  // 1. Draw hard shadow at (3 to 29, 3 to 29) offset (+2, +2)
  for (let y = 4; y < 30; y++) {
    for (let x = 4; x < 30; x++) {
      if ((x === 4 || x === 29) && (y === 4 || y === 29)) continue;
      setPixel(x, y, 0, 0, 0, 255);
    }
  }

  // 2. Base canvas white frame (x: 2 to 27, y: 2 to 27) with rounded corners
  for (let y = 2; y <= 26; y++) {
    for (let x = 2; x <= 26; x++) {
      const isCorner = 
        (x <= 3 && y <= 3) || 
        (x >= 25 && y <= 3) || 
        (x <= 3 && y >= 25) || 
        (x >= 25 && y >= 25);
      
      const isExtremeCorner = 
        (x === 2 && y <= 4) || (x <= 4 && y === 2) ||
        (x === 26 && y <= 4) || (x >= 24 && y === 2) ||
        (x === 2 && y >= 24) || (x <= 4 && y === 26) ||
        (x === 26 && y >= 24) || (x >= 24 && y === 26);

      if (isExtremeCorner) continue;

      const isBorder = 
        x === 2 || x === 26 || y === 2 || y === 26 ||
        (x <= 4 && y <= 4 && (x === 3 || y === 3)) ||
        (x >= 24 && y <= 4 && (x === 25 || y === 3)) ||
        (x <= 4 && y >= 24 && (x === 3 || y === 25)) ||
        (x >= 24 && y >= 24 && (x === 25 || y === 25));

      if (isBorder) {
        setPixel(x, y, 0, 0, 0, 255); // Black border
      } else {
        setPixel(x, y, 255, 255, 255, 255); // White canvas
      }
    }
  }

  // 3. Left Pill (Lilac #C5B0F4) from x=7..11, y=8..20
  for (let y = 8; y <= 20; y++) {
    for (let x = 7; x <= 11; x++) {
      if ((y === 8 || y === 20) && (x === 7 || x === 11)) continue;
      if (x === 7 || x === 11 || y === 8 || y === 20) {
        setPixel(x, y, 0, 0, 0, 255); // outline
      } else {
        setPixel(x, y, 197, 176, 244, 255); // #C5B0F4
      }
    }
  }

  // 4. Right Pill (Lime #DCEEB1) from x=17..21, y=8..20
  for (let y = 8; y <= 20; y++) {
    for (let x = 17; x <= 21; x++) {
      if ((y === 8 || y === 20) && (x === 17 || x === 21)) continue;
      if (x === 17 || x === 21 || y === 8 || y === 20) {
        setPixel(x, y, 0, 0, 0, 255); // outline
      } else {
        setPixel(x, y, 220, 238, 177, 255); // #DCEEB1
      }
    }
  }

  // 5. Center Bolt (Coral #F3C9B6) connecting the two
  for (let y = 12; y <= 16; y++) {
    for (let x = 11; x <= 17; x++) {
      setPixel(x, y, 243, 201, 182, 255); // Coral
    }
  }
  // Bolt outline
  setPixel(11, 12, 0, 0, 0, 255);
  setPixel(17, 12, 0, 0, 0, 255);
  setPixel(11, 16, 0, 0, 0, 255);
  setPixel(17, 16, 0, 0, 0, 255);

  // 6. Accent dot (Magenta #FF3D8B) at x=20, y=5
  setPixel(20, 5, 255, 61, 139, 255);
  setPixel(21, 5, 255, 61, 139, 255);
  setPixel(20, 6, 255, 61, 139, 255);
  setPixel(21, 6, 255, 61, 139, 255);

  // AND mask (1 bit per pixel, padded to 32 bits per row = 4 bytes per row)
  const andMaskSize = (width / 8) * height; // 32/8 * 32 = 128 bytes
  const andMask = Buffer.alloc(andMaskSize, 0);

  // BMP Header (BITMAPINFOHEADER) = 40 bytes
  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0);           // biSize
  bih.writeInt32LE(width, 4);         // biWidth
  bih.writeInt32LE(height * 2, 8);    // biHeight (doubled for ICO mask)
  bih.writeUInt16LE(1, 12);           // biPlanes
  bih.writeUInt16LE(bpp, 14);         // biBitCount
  bih.writeUInt32LE(0, 16);           // biCompression (BI_RGB)
  bih.writeUInt32LE(pixels.length + andMaskSize, 20); // biSizeImage
  bih.writeInt32LE(0, 24);            // biXPelsPerMeter
  bih.writeInt32LE(0, 28);            // biYPelsPerMeter
  bih.writeUInt32LE(0, 32);           // biClrUsed
  bih.writeUInt32LE(0, 36);           // biClrImportant

  const dibData = Buffer.concat([bih, pixels, andMask]);

  // ICONDIR = 6 bytes
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0); // reserved
  iconDir.writeUInt16LE(1, 2); // type 1 = icon
  iconDir.writeUInt16LE(1, 4); // 1 image

  // ICONDIRENTRY = 16 bytes
  const direntry = Buffer.alloc(16);
  direntry.writeUInt8(width, 0);       // bWidth
  direntry.writeUInt8(height, 1);      // bHeight
  direntry.writeUInt8(0, 2);           // bColorCount
  direntry.writeUInt8(0, 3);           // bReserved
  direntry.writeUInt16LE(1, 4);        // wPlanes
  direntry.writeUInt16LE(bpp, 6);      // wBitCount
  direntry.writeUInt32LE(dibData.length, 8); // dwBytesInRes
  direntry.writeUInt32LE(6 + 16, 12);  // dwImageOffset

  const icoFile = Buffer.concat([iconDir, direntry, dibData]);
  const outPath = path.join(__dirname, '..', 'public', 'favicon.ico');
  fs.writeFileSync(outPath, icoFile);
  console.log('✅ Generated favicon.ico successfully at', outPath, `(${icoFile.length} bytes)`);
}

createIco();
