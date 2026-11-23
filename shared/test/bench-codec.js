import { performance } from 'node:perf_hooks';
import {
  encodeInputBinary,
  decodeInputBinary,
  encodeSnapshotBinary,
  decodeSnapshotBinary,
} from '../src/codec.js';

const sampleInput = { seq: 512, tick: 1024, thrust: true, brake: false, left: true, right: false, fire: true };

const sampleSnapshot = {
  tick: 1024,
  lastProcessedSeq: 512,
  serverTimeMs: 34133.3,
  yourSlot: 0,
  ships: Array.from({ length: 4 }, (_, slot) => ({
    slot,
    alive: true,
    hp: 100,
    score: slot * 25,
    x: 150.25 + slot * 140,
    y: 220.5 + slot * 60,
    angle: 0.785 * (slot - 1),
    vx: 145.4,
    vy: -32.8,
  })),
  bullets: Array.from({ length: 4 }, (_, i) => ({
    id: 100 + i,
    ownerSlot: i % 4,
    x: 300 + i * 45,
    y: 280 - i * 20,
  })),
  asteroids: Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    radius: 26,
    x: 100 + i * 130,
    y: 120 + i * 70,
  })),
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const jsonSnapBytes = encoder.encode(JSON.stringify({ type: 'snapshot', v: 1, ...sampleSnapshot })).byteLength;
const jsonInBytes = encoder.encode(JSON.stringify({ type: 'input', v: 1, ...sampleInput })).byteLength;

const binSnapBytes = encodeSnapshotBinary(sampleSnapshot).byteLength;
const binInBytes = encodeInputBinary(sampleInput).byteLength;

const ITER = 20_000;

const t0 = performance.now();
for (let i = 0; i < ITER; i++) {
  const s = JSON.stringify({ type: 'snapshot', v: 1, ...sampleSnapshot });
  JSON.parse(decoder.decode(encoder.encode(s)));
}
const jsonUs = ((performance.now() - t0) * 1000) / ITER;

const t1 = performance.now();
for (let i = 0; i < ITER; i++) {
  const buf = encodeSnapshotBinary(sampleSnapshot);
  decodeSnapshotBinary(buf);
}
const binUs = ((performance.now() - t1) * 1000) / ITER;

console.log('| Codec | Bytes/snapshot | KB/s per client (down, 30 Hz) | KB/s per client (up, 30 Hz) | Encode+decode µs |');
console.log('| :--- | :---: | :---: | :---: | :---: |');
console.log(
  `| JSON | ${jsonSnapBytes} B | ${((jsonSnapBytes * 30) / 1024).toFixed(2)} KB/s | ${((jsonInBytes * 30) / 1024).toFixed(2)} KB/s | ${jsonUs.toFixed(1)} µs |`
);
console.log(
  `| Binary (DataView) | ${binSnapBytes} B | ${((binSnapBytes * 30) / 1024).toFixed(2)} KB/s | ${((binInBytes * 30) / 1024).toFixed(2)} KB/s | ${binUs.toFixed(1)} µs |`
);