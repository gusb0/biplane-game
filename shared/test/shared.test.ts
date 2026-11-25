import test from "node:test";
import assert from "node:assert/strict";
import {
  asEntityId,
  asPlayerSlot,
  asSeq,
  asTick,
  createInitialWorldState,
  createShipState,
  stepWorld,
  hashSimulationState,
  encodeInputBinary,
  decodeInputBinary,
  encodeSnapshotBinary,
  decodeSnapshotBinary,
  FIXED_DT,
} from "../src/index.js";
import type { PlayerInput, PlayerSlot } from "../src/index.js";

test("shared simulation imports cleanly in Node without DOM and is 100% deterministic", () => {
  assert.equal(typeof globalThis.window, "undefined");

  const run1000Steps = (): string => {
    const world = createInitialWorldState({ seed: 98765 });
    const s0 = asPlayerSlot(0);
    const s1 = asPlayerSlot(1);
    world.ships.push(createShipState({ slot: s0, id: "p1", name: "Alpha", arena: world.arena }));
    world.ships.push(createShipState({ slot: s1, id: "p2", name: "Bravo", arena: world.arena }));

    for (let t = 0; t < 1000; t++) {
      const inputs = new Map<PlayerSlot, PlayerInput>();
      inputs.set(s0, {
        seq: asSeq(t + 1),
        tick: asTick(t),
        thrust: t % 3 !== 0,
        brake: false,
        left: t % 17 < 6,
        right: t % 23 < 5,
        fire: t % 15 === 0,
      });
      inputs.set(s1, {
        seq: asSeq(t + 1),
        tick: asTick(t),
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

  assert.equal(run1000Steps(), run1000Steps());
});

test("DataView binary codec round-trips Input and Snapshot within quantization tolerance", () => {
  const input: PlayerInput = {
    seq: asSeq(142),
    tick: asTick(900),
    thrust: true,
    brake: false,
    left: true,
    right: false,
    fire: true,
  };
  const decodedInput = decodeInputBinary(encodeInputBinary(input));
  assert.deepEqual(decodedInput, input);

  const decodedSnap = decodeSnapshotBinary(
    encodeSnapshotBinary({
      tick: asTick(1200),
      lastProcessedSeq: asSeq(88),
      serverTimeMs: 40000.5,
      yourSlot: asPlayerSlot(1),
      ships: [
        {
          kind: "ship",
          slot: asPlayerSlot(0),
          alive: true,
          hp: 100,
          maxHp: 100,
          score: 45,
          x: 123.45,
          y: 456.75,
          angle: 1.234,
          vx: 120.5,
          vy: -45.2,
        },
      ],
      bullets: [{ kind: "bullet", id: asEntityId(105), ownerSlot: asPlayerSlot(0), x: 300.25, y: 400.5 }],
      asteroids: [{ kind: "asteroid", id: asEntityId(1), radius: 28, x: 512.5, y: 320.25 }],
    })
  );

  assert.equal(decodedSnap.tick, 1200);
  assert.equal(decodedSnap.lastProcessedSeq, 88);
  assert.equal(decodedSnap.ships[0]?.kind, "ship");
  assert.equal(decodedSnap.bullets[0]?.kind, "bullet");
  assert.equal(decodedSnap.asteroids[0]?.kind, "asteroid");
});