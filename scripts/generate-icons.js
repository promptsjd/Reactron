import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, drawPixelFn) {
  // 8 bytes signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw pixel data: each scanline starts with a filter byte (0x00) followed by width * 4 bytes
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixelFn(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4);
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

// CRC32 implementation
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Draw a cool high-tech bolt icon with cyan/blue gradient
function drawReactronIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const dist = Math.hypot(x - cx, y - cy);

  // Background rounded circle
  if (dist > r - 1) {
    return [0, 0, 0, 0]; // Transparent outside
  }

  // Circular gradient badge (#0f172a to #0284c7)
  const normY = y / h;
  const bgR = Math.round(15 + normY * (2 - 15));
  const bgG = Math.round(23 + normY * (132 - 23));
  const bgB = Math.round(42 + normY * (199 - 42));

  // Center bolt symbol coordinates (approximate bolt)
  const nx = (x - cx) / r;
  const ny = (y - cy) / r;

  // Bolt logic: upper triangle, diagonal slash, lower triangle
  let isBolt = false;
  if (ny > -0.65 && ny < 0.65) {
    if (ny < 0.05 && nx > -0.25 - ny * 0.4 && nx < 0.35 - ny * 0.2) isBolt = true;
    if (ny >= -0.05 && nx > -0.35 - ny * 0.2 && nx < 0.25 - ny * 0.4) isBolt = true;
  }

  if (isBolt) {
    return [255, 235, 59, 255]; // Yellow/gold lightning bolt
  }

  // Border ring
  if (dist > r - (w > 32 ? 3 : 1.5)) {
    return [56, 189, 248, 255]; // Bright cyan border
  }

  return [bgR, bgG, bgB, 255];
}

const iconsDir = path.resolve('extension/icons');
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const pngBuf = createPNG(size, size, drawReactronIcon);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`Generated icon${size}.png (${pngBuf.length} bytes)`);
}
