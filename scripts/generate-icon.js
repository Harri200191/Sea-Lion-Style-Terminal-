/**
 * Draws the Marketplace icon (images/icon.png): a minimalist sea lion wearing
 * headphones, on a deep ocean-blue background.
 *
 * Everything is rendered with plain maths and encoded as a PNG using Node's
 * built-in zlib, so there is no image dependency to install. The canvas is
 * supersampled 4x and box-filtered down, which is what keeps the curves smooth.
 *
 * Run with: npm run icon
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 128;
const SS = 4; // supersampling factor
const W = SIZE * SS;

const palette = {
  background: [11, 60, 93],
  backgroundLight: [23, 88, 130],
  body: [122, 90, 68],
  bodyDark: [92, 66, 49],
  belly: [163, 128, 100],
  muzzle: [196, 166, 140],
  headphone: [242, 201, 76],
  headphoneDark: [201, 162, 51],
  dark: [26, 32, 44],
  white: [255, 255, 255]
};

/** Signed-distance helpers: negative inside, positive outside. */
const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

function ellipse(x, y, cx, cy, rx, ry, rotation = 0) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = x - cx;
  const dy = y - cy;
  const u = (dx * cos + dy * sin) / rx;
  const v = (-dx * sin + dy * cos) / ry;
  return Math.hypot(u, v) - 1;
}

/** Distance to a thick line segment, used for the headphone band and whiskers. */
function segment(x, y, x1, y1, x2, y2, thickness) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) - thickness;
}

/** An annulus, for the headphone arc. */
const ring = (x, y, cx, cy, r, thickness) => Math.abs(Math.hypot(x - cx, y - cy) - r) - thickness;

const canvas = new Float64Array(W * W * 3);

function paint(x, y, colour, coverage) {
  if (coverage <= 0) {
    return;
  }
  const alpha = Math.min(1, coverage);
  const i = (y * W + x) * 3;
  canvas[i] = canvas[i] * (1 - alpha) + colour[0] * alpha;
  canvas[i + 1] = canvas[i + 1] * (1 - alpha) + colour[1] * alpha;
  canvas[i + 2] = canvas[i + 2] * (1 - alpha) + colour[2] * alpha;
}

/** Fills every pixel where `sdf` is negative. */
function fill(sdf, colour) {
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      // Sample at pixel centres in a 0..128 coordinate space.
      const u = (x + 0.5) / SS;
      const v = (y + 0.5) / SS;
      if (sdf(u, v) < 0) {
        paint(x, y, colour, 1);
      }
    }
  }
}

// --- background -------------------------------------------------------------
for (let y = 0; y < W; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / W;
    const colour = [
      palette.background[0] + (palette.backgroundLight[0] - palette.background[0]) * t,
      palette.background[1] + (palette.backgroundLight[1] - palette.background[1]) * t,
      palette.background[2] + (palette.backgroundLight[2] - palette.background[2]) * t
    ];
    paint(x, y, colour, 1);
  }
}

// A soft highlight behind the sea lion so it lifts off the background.
fill((x, y) => circle(x, y, 64, 74, 46), [
  palette.backgroundLight[0] + 12,
  palette.backgroundLight[1] + 14,
  palette.backgroundLight[2] + 16
]);

// --- body -------------------------------------------------------------------
// Chest and shoulders.
fill((x, y) => ellipse(x, y, 64, 108, 34, 26), palette.bodyDark);
fill((x, y) => ellipse(x, y, 64, 110, 26, 20), palette.belly);

// Flippers.
fill((x, y) => ellipse(x, y, 33, 106, 13, 7, -0.5), palette.bodyDark);
fill((x, y) => ellipse(x, y, 95, 106, 13, 7, 0.5), palette.bodyDark);

// --- head -------------------------------------------------------------------
fill((x, y) => ellipse(x, y, 64, 66, 30, 28), palette.body);

// Muzzle.
fill((x, y) => ellipse(x, y, 64, 82, 19, 13), palette.muzzle);

// Eyes.
fill((x, y) => circle(x, y, 53, 63, 5.4), palette.dark);
fill((x, y) => circle(x, y, 75, 63, 5.4), palette.dark);
fill((x, y) => circle(x, y, 54.8, 61.2, 1.9), palette.white);
fill((x, y) => circle(x, y, 76.8, 61.2, 1.9), palette.white);

// Nose and mouth.
fill((x, y) => ellipse(x, y, 64, 77, 5, 3.8), palette.dark);
fill((x, y) => segment(x, y, 64, 80, 64, 85, 1.1), palette.dark);
fill((x, y) => segment(x, y, 64, 85, 57, 88, 1.1), palette.dark);
fill((x, y) => segment(x, y, 64, 85, 71, 88, 1.1), palette.dark);

// Whiskers.
for (const side of [-1, 1]) {
  fill((x, y) => segment(x, y, 64 + side * 8, 80, 64 + side * 24, 77, 0.8), palette.dark);
  fill((x, y) => segment(x, y, 64 + side * 8, 83, 64 + side * 25, 84, 0.8), palette.dark);
}

// --- headphones -------------------------------------------------------------
// Band arcs over the top of the head; clipped to the upper half.
fill((x, y) => Math.max(ring(x, y, 64, 62, 35, 3.4), y - 62), palette.headphone);

// Ear cups.
fill((x, y) => ellipse(x, y, 29, 66, 9, 12), palette.headphoneDark);
fill((x, y) => ellipse(x, y, 99, 66, 9, 12), palette.headphoneDark);
fill((x, y) => ellipse(x, y, 29, 66, 6, 9), palette.headphone);
fill((x, y) => ellipse(x, y, 99, 66, 6, 9), palette.headphone);

// --- downsample -------------------------------------------------------------
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * W + (x * SS + sx)) * 3;
        r += canvas[i];
        g += canvas[i + 1];
        b += canvas[i + 2];
      }
    }
    const n = SS * SS;
    const o = (y * SIZE + x) * 4;
    pixels[o] = Math.round(r / n);
    pixels[o + 1] = Math.round(g / n);
    pixels[o + 2] = Math.round(b / n);
    pixels[o + 3] = 255;
  }
}

// --- PNG encoding -----------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
ihdr[10] = 0; // deflate
ihdr[11] = 0; // adaptive filtering
ihdr[12] = 0; // no interlace

// Each scanline is prefixed with filter type 0 (none).
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const target = path.join(__dirname, '..', 'images', 'icon.png');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, png);
console.log(`wrote images/icon.png  ${SIZE}x${SIZE}  ${png.length} bytes`);
