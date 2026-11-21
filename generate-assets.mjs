import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const W = 768;
const H = 128;
const pixels = new Uint8Array(W * H * 4);

function setPx(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const idx = (y * W + x) * 4;
  if (a === 255) {
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = 255;
  } else if (a > 0) {
    const alpha = a / 255;
    const inv = 1 - alpha;
    pixels[idx] = Math.round(r * alpha + pixels[idx] * inv);
    pixels[idx + 1] = Math.round(g * alpha + pixels[idx + 1] * inv);
    pixels[idx + 2] = Math.round(b * alpha + pixels[idx + 2] * inv);
    pixels[idx + 3] = Math.min(255, Math.round(a + pixels[idx + 3] * inv));
  }
}

function fillCircle(cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPx(x, y, ...color);
    }
  }
}

function fillRect(x0, y0, w, h, color) {
  for (let y = Math.floor(y0); y < Math.floor(y0 + h); y++) {
    for (let x = Math.floor(x0); x < Math.floor(x0 + w); x++) {
      setPx(x, y, ...color);
    }
  }
}

function fillPoly(pts, color) {
  const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
  const maxY = Math.min(H - 1, Math.floor(Math.max(...pts.map((p) => p[1]))));
  for (let y = minY; y <= maxY; y++) {
    const nodes = [];
    let j = pts.length - 1;
    for (let i = 0; i < pts.length; i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if ((yi < y && yj >= y) || (yj < y && yi >= y)) {
        nodes.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
      j = i;
    }
    nodes.sort((a, b) => a - b);
    for (let k = 0; k < nodes.length; k += 2) {
      if (k + 1 < nodes.length) {
        for (let x = Math.floor(nodes[k]); x <= Math.floor(nodes[k + 1]); x++) {
          setPx(x, y, ...color);
        }
      }
    }
  }
}

// 0: Biplane
const cx0 = 64, cy0 = 64;
fillRect(cx0 - 44, cy0 - 18, 12, 36, [220, 38, 38, 255]);
fillPoly([[cx0 + 48, cy0], [cx0 - 38, cy0 - 13], [cx0 - 46, cy0], [cx0 - 38, cy0 + 13]], [241, 245, 249, 255]);
fillCircle(cx0 - 8, cy0, 8, [30, 41, 59, 255]);
fillRect(cx0 - 16, cy0 - 42, 12, 84, [185, 28, 28, 255]);
fillRect(cx0 - 4, cy0 - 48, 18, 96, [239, 68, 68, 255]);
fillRect(cx0 + 1, cy0 - 44, 6, 88, [254, 240, 138, 255]);
fillCircle(cx0 + 46, cy0, 6, [250, 204, 21, 255]);
fillRect(cx0 + 50, cy0 - 22, 4, 44, [253, 224, 71, 220]);

// 1: Bullet
const cx1 = 192, cy1 = 64;
fillCircle(cx1, cy1, 18, [250, 204, 21, 90]);
fillPoly([[cx1 + 26, cy1], [cx1 - 18, cy1 - 8], [cx1 - 24, cy1], [cx1 - 18, cy1 + 8]], [254, 240, 138, 255]);
fillCircle(cx1 + 10, cy1, 6, [255, 255, 255, 255]);

// 2: Homing Bullet
const cx2 = 320, cy2 = 64;
fillCircle(cx2, cy2, 22, [56, 189, 248, 90]);
fillPoly([[cx2 - 14, cy2 - 16], [cx2 - 26, cy2 - 16], [cx2 - 22, cy2 + 16], [cx2 - 14, cy2 + 16]], [239, 68, 68, 255]);
fillPoly([[cx2 + 30, cy2], [cx2 + 12, cy2 - 9], [cx2 - 22, cy2 - 9], [cx2 - 22, cy2 + 9], [cx2 + 12, cy2 + 9]], [56, 189, 248, 255]);
fillCircle(cx2 + 18, cy2, 5, [224, 242, 254, 255]);

// 3: Asteroid
const cx3 = 448, cy3 = 64;
const astPts = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const r = i % 2 === 0 ? 46 : 38;
  return [cx3 + Math.cos(a) * r, cy3 + Math.sin(a) * r];
});
fillPoly(astPts, [100, 116, 139, 255]);
fillCircle(cx3 - 14, cy3 - 12, 10, [71, 85, 105, 255]);
fillCircle(cx3 + 15, cy3 + 10, 12, [71, 85, 105, 255]);

// 4: Homing Asteroid
const cx4 = 576, cy4 = 64;
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  fillPoly(
    [
      [cx4 + Math.cos(a - 0.18) * 34, cy4 + Math.sin(a - 0.18) * 34],
      [cx4 + Math.cos(a) * 52, cy4 + Math.sin(a) * 52],
      [cx4 + Math.cos(a + 0.18) * 34, cy4 + Math.sin(a + 0.18) * 34],
    ],
    [225, 29, 72, 255]
  );
}
fillCircle(cx4, cy4, 36, [136, 19, 55, 255]);
fillCircle(cx4, cy4, 26, [244, 63, 94, 255]);
fillCircle(cx4, cy4, 11, [254, 205, 211, 255]);

// 5: Pickup
const cx5 = 704, cy5 = 64;
fillCircle(cx5, cy5, 44, [16, 185, 129, 80]);
fillCircle(cx5, cy5, 34, [248, 250, 252, 255]);
fillCircle(cx5, cy5, 29, [14, 165, 233, 255]);
fillRect(cx5 - 5, cy5 - 16, 10, 32, [254, 240, 138, 255]);
fillRect(cx5 - 16, cy5 - 5, 32, 10, [254, 240, 138, 255]);

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(tag, data) {
  const tagBuf = Buffer.from(tag);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tagBuf, data])), 0);
  return Buffer.concat([lenBuf, tagBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeWav(samples, sampleRate = 22050) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buf;
}

fs.mkdirSync(path.resolve('public/assets/sounds'), { recursive: true });
fs.writeFileSync('public/assets/spritesheet.png', encodePng(W, H, pixels));

const sr = 22050;
const shoot = Array.from({ length: Math.floor(sr * 0.14) }, (_, i) => {
  const t = i / sr;
  const freq = 880 * Math.exp(-t * 14) + 180;
  return 0.45 * Math.exp(-t * 22) * Math.sin(2 * Math.PI * freq * t);
});
const hit = Array.from({ length: Math.floor(sr * 0.12) }, (_, i) => {
  const t = i / sr;
  return 0.45 * Math.exp(-t * 28) * (Math.sin(2 * Math.PI * 190 * t) + 0.5 * Math.sin(2 * Math.PI * 310 * t));
});
const explosion = Array.from({ length: Math.floor(sr * 0.42) }, (_, i) => {
  const t = i / sr;
  const boom = Math.sin(2 * Math.PI * (95 * Math.exp(-t * 4)) * t);
  const noise = (Math.random() * 2 - 1) * 0.65;
  return 0.55 * Math.exp(-t * 7.5) * (0.6 * boom + 0.4 * noise);
});
const notes = [523.25, 659.25, 783.99, 1046.5];
const pickup = Array.from({ length: Math.floor(sr * 0.24) }, (_, i) => {
  const t = i / sr;
  const idx = Math.min(3, Math.floor(t / 0.06));
  return 0.4 * Math.exp(-(t % 0.06) * 12) * Math.sin(2 * Math.PI * notes[idx] * t);
});

fs.writeFileSync('public/assets/sounds/shoot.wav', encodeWav(shoot, sr));
fs.writeFileSync('public/assets/sounds/hit.wav', encodeWav(hit, sr));
fs.writeFileSync('public/assets/sounds/explosion.wav', encodeWav(explosion, sr));
fs.writeFileSync('public/assets/sounds/pickup.wav', encodeWav(pickup, sr));
console.log('Generated spritesheet.png and 4 WAV files!');