/**
 * Generador del icono de la extension.
 *
 * Produce `assets/icon.png` (128x128 RGBA) de forma determinista, sin
 * dependencias externas: el PNG se codifica a mano y se comprime con zlib.
 *
 * Uso:  node tools/generate-icon.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'assets', 'icon.png');

const SIZE = 128;
const SCALE = 4; // supermuestreo para el antialiasing

/** Distancia con signo a un rectangulo de esquinas redondeadas. */
function roundedRect(px, py, left, top, width, height, radius) {
  const dx = Math.abs(px - (left + width / 2)) - (width / 2 - radius);
  const dy = Math.abs(py - (top + height / 2)) - (height / 2 - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(ax, ay) - radius;
}

/** Distancia con signo a un segmento de recta con grosor. */
function segment(px, py, x0, y0, x1, y1, thickness) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)) - thickness / 2;
}

/** Cobertura antialiaseada de una distancia con signo. */
function coverage(distance) {
  return Math.max(0, Math.min(1, 0.5 - distance));
}

/** Mezcla dos colores con un factor alfa. */
function blend(base, layer, alpha) {
  return [
    base[0] + (layer[0] - base[0]) * alpha,
    base[1] + (layer[1] - base[1]) * alpha,
    base[2] + (layer[2] - base[2]) * alpha,
    base[3] + (layer[3] - base[3]) * alpha,
  ];
}

const BACKGROUND_TOP = [0x2b, 0x35, 0x45];
const BACKGROUND_BOTTOM = [0x16, 0x1c, 0x26];
const PAPER = [0xed, 0xf2, 0xf7];
const RULE = [0x7d, 0x8b, 0x9e];
const ACCENT = [0xf6, 0xa6, 0x23];
const HALO = [0x16, 0x1c, 0x26];

/** Geometria del icono, en coordenadas de 128x128. */
const SHEET = { left: 28, top: 20, width: 54, height: 70, radius: 5 };
const LINES = [
  { left: 38, top: 40, width: 32 },
  { left: 38, top: 52, width: 24 },
  { left: 38, top: 64, width: 28 },
];
const CHECK = [
  [32, 86, 53, 102],
  [53, 102, 98, 44],
];
const CHECK_THICKNESS = 13;

/** Color de un punto del icono. */
function shade(x, y) {
  // Fondo con degradado vertical.
  let color = [
    BACKGROUND_TOP[0] + (BACKGROUND_BOTTOM[0] - BACKGROUND_TOP[0]) * (y / SIZE),
    BACKGROUND_TOP[1] + (BACKGROUND_BOTTOM[1] - BACKGROUND_TOP[1]) * (y / SIZE),
    BACKGROUND_TOP[2] + (BACKGROUND_BOTTOM[2] - BACKGROUND_TOP[2]) * (y / SIZE),
    255,
  ];

  // Hoja de papel.
  const paperAlpha = coverage(
    roundedRect(x, y, SHEET.left, SHEET.top, SHEET.width, SHEET.height, SHEET.radius),
  );
  if (paperAlpha > 0) {
    color = blend(color, PAPER, paperAlpha);
  }

  // Renglones de codigo.
  for (const line of LINES) {
    const alpha = coverage(roundedRect(x, y, line.left, line.top, line.width, 6, 3));
    if (alpha > 0) {
      color = blend(color, RULE, alpha * 0.9);
    }
  }

  // Marca de validacion, con halo oscuro para separarla del papel.
  const check = Math.min(
    segment(x, y, CHECK[0][0], CHECK[0][1], CHECK[0][2], CHECK[0][3], CHECK_THICKNESS),
    segment(x, y, CHECK[1][0], CHECK[1][1], CHECK[1][2], CHECK[1][3], CHECK_THICKNESS),
  );
  const haloAlpha = coverage(check - 3) * 0.92;
  if (haloAlpha > 0) {
    color = blend(color, HALO, haloAlpha);
  }
  const checkAlpha = coverage(check);
  if (checkAlpha > 0) {
    color = blend(color, ACCENT, checkAlpha);
  }

  return color;
}

/** Codifica un PNG RGBA a partir de una matriz de pixeles. */
function encodePng(pixels, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro None
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) {
      c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // color RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Renderizado con supermuestreo y reduccion por promediado.
const big = Buffer.alloc(SIZE * SCALE * SIZE * SCALE * 4);
for (let y = 0; y < SIZE * SCALE; y++) {
  for (let x = 0; x < SIZE * SCALE; x++) {
    const color = shade(x / SCALE, y / SCALE);
    const offset = (y * SIZE * SCALE + x) * 4;
    big[offset] = Math.round(color[0]);
    big[offset + 1] = Math.round(color[1]);
    big[offset + 2] = Math.round(color[2]);
    big[offset + 3] = Math.round(color[3]);
  }
}

const small = Buffer.alloc(SIZE * SIZE * 4);
const samples = SCALE * SCALE;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SCALE; sy++) {
      for (let sx = 0; sx < SCALE; sx++) {
        const offset = ((y * SCALE + sy) * SIZE * SCALE + (x * SCALE + sx)) * 4;
        r += big[offset];
        g += big[offset + 1];
        b += big[offset + 2];
        a += big[offset + 3];
      }
    }
    const target = (y * SIZE + x) * 4;
    small[target] = Math.round(r / samples);
    small[target + 1] = Math.round(g / samples);
    small[target + 2] = Math.round(b / samples);
    small[target + 3] = Math.round(a / samples);
  }
}

mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, encodePng(small, SIZE, SIZE));
console.log('Icono: ' + OUTPUT);
