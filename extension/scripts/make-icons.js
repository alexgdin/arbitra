// Generează icon-16/32/48/128.png fără dependențe: encoder PNG minimal + supraeșantionare.
// Rulare: bun extension/scripts/make-icons.js
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const SIZES = [16, 32, 48, 128];
const SAMPLES = 6; // eșantioane pe axă, per pixel (anti-aliasing)
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Pătratul rotunjit, în coordonate unitare (0..1)
const SQUARE = { inset: 0.04, radius: 0.22 };
// Gradient vertical smarald, în jurul lui #0f9d75
const COLOR_TOP = [0x14, 0xb0, 0x86];
const COLOR_BOTTOM = [0x0b, 0x86, 0x64];
// Linia de tendință în scădere (forma "trending-down", grosimea în unități)
const STROKE = 0.1;
const TREND_LINES = [
  [
    [0.16, 0.33],
    [0.34, 0.51],
    [0.49, 0.36],
    [0.84, 0.67],
  ],
  [
    [0.62, 0.67],
    [0.84, 0.67],
    [0.84, 0.45],
  ],
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * CRC32 (IEEE) cum îl cere formatul PNG.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Un chunk PNG: lungime, tip, date, CRC peste tip și date.
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/**
 * Codează pixeli RGBA (8 biți) într-un fișier PNG.
 * @param {number} size latura în pixeli
 * @param {Uint8Array} rgba size * size * 4 octeți
 * @returns {Buffer}
 */
function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8); // adâncime de biți
  header.writeUInt8(6, 9); // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size); // fiecare rând începe cu filtrul 0
  for (let y = 0; y < size; y += 1) {
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Distanța de la punct la un segment.
 * @param {number} px
 * @param {number} py
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function distanceToSegment(px, py, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/**
 * Este punctul în pătratul rotunjit? (distanță semnată la dreptunghiul rotunjit)
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function insideSquare(x, y) {
  const half = 0.5 - SQUARE.inset;
  const qx = Math.abs(x - 0.5) - (half - SQUARE.radius);
  const qy = Math.abs(y - 0.5) - (half - SQUARE.radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) <= SQUARE.radius;
}

/**
 * Este punctul pe linia albă de tendință (capete și îmbinări rotunde)?
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function insideTrend(x, y) {
  return TREND_LINES.some((line) =>
    line.some((point, i) => i > 0 && distanceToSegment(x, y, line[i - 1], point) <= STROKE / 2),
  );
}

/**
 * Culoarea unui punct din pictogramă: [r, g, b, a] cu a în 0..1.
 * @param {number} x
 * @param {number} y
 * @returns {number[]}
 */
function sample(x, y) {
  if (!insideSquare(x, y)) {
    return [0, 0, 0, 0];
  }
  if (insideTrend(x, y)) {
    return [255, 255, 255, 1];
  }
  const mix = (i) => COLOR_TOP[i] + (COLOR_BOTTOM[i] - COLOR_TOP[i]) * y;
  return [mix(0), mix(1), mix(2), 1];
}

/**
 * Desenează pictograma la dimensiunea dată, mediind SAMPLES x SAMPLES eșantioane per pixel.
 * @param {number} size
 * @returns {Uint8Array} RGBA, necumulat (non-premultiplied)
 */
function renderIcon(size) {
  const rgba = new Uint8Array(size * size * 4);
  const total = SAMPLES * SAMPLES;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const [cr, cg, cb, ca] = sample((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const offset = (py * size + px) * 4;
      if (a > 0) {
        rgba[offset] = Math.round(r / a);
        rgba[offset + 1] = Math.round(g / a);
        rgba[offset + 2] = Math.round(b / a);
      }
      rgba[offset + 3] = Math.round((a / total) * 255);
    }
  }
  return rgba;
}

/** Scrie cele patru fișiere în extension/icons/. */
function main() {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
  mkdirSync(outDir, { recursive: true });
  for (const size of SIZES) {
    const file = join(outDir, `icon-${size}.png`);
    writeFileSync(file, encodePng(size, renderIcon(size)));
  }
}

main();
