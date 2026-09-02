#!/usr/bin/env node
/** Génère les icônes PNG de la PWA (pylône stylisé) sans dépendance externe. */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'icons');

const FOND = [11, 37, 69];
const TRAIT = [255, 209, 102];

function creer(taille) {
  const px = new Uint8Array(taille * taille * 3);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= taille || y >= taille) return;
    const i = (y * taille + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };
  for (let i = 0; i < taille * taille; i++) {
    px[i * 3] = FOND[0];
    px[i * 3 + 1] = FOND[1];
    px[i * 3 + 2] = FOND[2];
  }

  const ep = Math.max(2, Math.round(taille / 42));
  const trait = (x0, y0, x1, y1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n);
      const y = Math.round(y0 + ((y1 - y0) * k) / n);
      for (let dy = -ep; dy <= ep; dy++)
        for (let dx = -ep; dx <= ep; dx++) if (dx * dx + dy * dy <= ep * ep) set(x + dx, y + dy, TRAIT);
    }
  };

  const u = taille / 100;
  // fût du pylône
  trait(38 * u, 88 * u, 45 * u, 30 * u);
  trait(62 * u, 88 * u, 55 * u, 30 * u);
  // traverses
  trait(41 * u, 68 * u, 59 * u, 68 * u);
  trait(43 * u, 52 * u, 57 * u, 52 * u);
  // consoles
  trait(20 * u, 44 * u, 80 * u, 44 * u);
  trait(28 * u, 30 * u, 72 * u, 30 * u);
  // treillis
  trait(41 * u, 68 * u, 57 * u, 52 * u);
  trait(59 * u, 68 * u, 43 * u, 52 * u);
  trait(38 * u, 88 * u, 59 * u, 68 * u);
  trait(62 * u, 88 * u, 41 * u, 68 * u);
  // câbles suggérés
  trait(20 * u, 44 * u, 6 * u, 52 * u);
  trait(80 * u, 44 * u, 94 * u, 52 * u);

  // encodage PNG (RGB 8 bits, filtre 0)
  const brut = Buffer.alloc(taille * (taille * 3 + 1));
  for (let y = 0; y < taille; y++) {
    brut[y * (taille * 3 + 1)] = 0;
    Buffer.from(px.buffer, y * taille * 3, taille * 3).copy(brut, y * (taille * 3 + 1) + 1);
  }

  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc = (buf) => {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const corps = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(corps));
    return Buffer.concat([len, corps, c]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const t of [192, 512]) {
  fs.writeFileSync(path.join(OUT, `icon-${t}.png`), creer(t));
  console.log(`✓ icons/icon-${t}.png`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="16" fill="#0b2545"/>
  <g stroke="#ffd166" stroke-width="4" stroke-linecap="round" fill="none">
    <path d="M38 88 L45 30 M62 88 L55 30"/>
    <path d="M41 68 H59 M43 52 H57 M20 44 H80 M28 30 H72"/>
    <path d="M41 68 L57 52 M59 68 L43 52 M38 88 L59 68 M62 88 L41 68"/>
    <path d="M20 44 L6 52 M80 44 L94 52"/>
  </g>
</svg>
`;
fs.writeFileSync(path.resolve(__dirname, '..', 'public', 'favicon.svg'), svg);
console.log('✓ favicon.svg');
