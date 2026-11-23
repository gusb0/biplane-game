import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialWorldState,
  createShipState,
  stepWorld,
  hashSimulationState,
  encodeInputBinary,
  decodeInputBinary,
  encodeSnapshotBinary,
  decodeSnapshotBinary,
  FIXED_DT,
} from '../src/index.js';

test('shared simulation imports cleanly in Node without DOM and is 100% deterministic', () => {
  assert.equal(typeof globalThis.window, 'undefined');

  const run1000Steps = () => {
    const world = createInitialWorldState({ seed: 98765 });
    world.ships.push(createShipState({ slot: 0, id: 'p1', name: 'Alpha', arena: world.arena }));
    world.ships.push(createShipState({ slot: 1, id: 'p2', name: 'Bravo', arena: world.arena }));

    for (let t = 0; t < 1000; t++) {
      const inputs = new Map();
      inputs.set(0, {
        seq: t + 1,
        tick: t,
        thrust: t % 3 !== 0,
        brake: false,
        left: t % 17 < 6,
        right: t % 23 < 5,
        fire: t % 15 === 0,
      });
      inputs.set(1, {
        seq: t + 1,
        tick: t,
        thrust: t % 2 === 0,
        brake: t % 19 === 0,
        left: false,
        right: t % 11 < 4,
        fire: t % 20 === 0,
      });
      stepWorld(world, inputs, FIXED_DT);
    }
    return hashSimulationState(world);
  };

  const hashA = run1000Steps();
  const hashB = run1000Steps();
  assert.equal(hashA, hashB);
});

test('DataView binary codec round-trips Input and Snapshot within quantization tolerance', () => {
  const input = { seq: 142, tick: 900, thrust: true, brake: false, left: true, right: false, fire: true };
  const decodedInput = decodeInputBinary(encodeInputBinary(input));
  assert.deepEqual(decodedInput, { type: 'input', v: 1, ...input });

  const snapshot = {
    tick: 1200,
    lastProcessedSeq: 88,
    serverTimeMs: 40000.5,
    yourSlot: 1,
    ships: [
      { slot: 0, alive: true, hp: 100, score: 45, x: 123.45, y: 456.75, angle: 1.234, vx: 120.5, vy: -45.2 },
      { slot: 1, alive: false, hp: 0, score: 110, x: 780.125, y: 210.5, angle: -2.718, vx: 0, vy: 0 },
    ],
    bullets: [{ id: 105, ownerSlot: 0, x: 300.25, y: 400.5 }],
    asteroids: [{ id: 1, radius: 28, x: 512.5, y: 320.25 }],
  };

  const decoded = decodeSnapshotBinary(encodeSnapshotBinary(snapshot));
  assert.equal(decoded.tick, snapshot.tick);
  assert.equal(decoded.lastProcessedSeq, snapshot.lastProcessedSeq);
  assert.equal(decoded.yourSlot, 1);
  assert.equal(decoded.ships.length, 2);
  assert.ok(Math.abs(decoded.ships[0].x - snapshot.ships[0].x) < 0.001);
  assert.ok(Math.abs(decoded.ships[0].angle - snapshot.ships[0].angle) <= 0.001);
  assert.ok(Math.abs(decoded.ships[0].vx - snapshot.ships[0].vx) <= 0.1);
  assert.deepEqual(decoded.bullets, snapshot.bullets);
  assert.deepEqual(decoded.asteroids, snapshot.asteroids);
});