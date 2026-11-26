import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  FIXED_DT,
  asEntityId,
  asPlayerSlot,
  asSeq,
  asTick,
  createInitialWorldState,
  createShipState,
  decodeInputBinary,
  decodeSnapshotBinary,
  encodeInputBinary,
  encodeSnapshotBinary,
  integrateShip,
  normalizeAngle,
  parseClientMessage,
  sanitizeInput,
  stepWorld,
} from "../src/index.js";
import type { PlayerInput, PlayerSlot, ShipSnapshot, WorldState } from "../src/index.js";

function cloneWorld(state: WorldState): WorldState {
  return structuredClone(state);
}

function makeInput(overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    seq: asSeq(1),
    tick: asTick(0),
    thrust: false,
    brake: false,
    left: false,
    right: false,
    fire: false,
    ...overrides,
  };
}

describe("Shared: angles, vector integration & arena invariants", () => {
  it("normalizes angles into [-PI, PI]", () => {
    expect(normalizeAngle(0)).toBeCloseTo(0, 6);
    expect(normalizeAngle(Math.PI * 2)).toBeCloseTo(0, 6);
    expect(normalizeAngle(-Math.PI * 2)).toBeCloseTo(0, 6);
    expect(Math.abs(normalizeAngle(Math.PI * 3.5))).toBeLessThanOrEqual(Math.PI + 1e-9);
    expect(Math.abs(normalizeAngle(-Math.PI * 3.5))).toBeLessThanOrEqual(Math.PI + 1e-9);
  });

  it("integrates thrust forward along +X when angle is 0", () => {
    const ship = createShipState({ slot: asPlayerSlot(0), id: "s0", name: "P1" });
    ship.x = 200;
    ship.y = 200;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = 0;

    integrateShip(ship, makeInput({ seq: asSeq(1), tick: asTick(1), thrust: true }), FIXED_DT);

    expect(ship.vx).toBeGreaterThan(0);
    expect(ship.vy).toBeCloseTo(0, 6);
    expect(ship.x).toBeGreaterThan(200);
    expect(ship.y).toBeCloseTo(200, 6);
  });

  it("integrates brake decelerating forward motion", () => {
    const ship = createShipState({ slot: asPlayerSlot(0), id: "s0", name: "P1" });
    ship.vx = 180;
    ship.vy = 0;
    ship.angle = 0;

    integrateShip(ship, makeInput({ brake: true }), FIXED_DT);
    expect(ship.vx).toBeLessThan(180);
  });

  it("rotates left and right according to input", () => {
    const leftShip = createShipState({ slot: asPlayerSlot(0) });
    const rightShip = createShipState({ slot: asPlayerSlot(1) });
    leftShip.angle = 0;
    rightShip.angle = 0;

    integrateShip(leftShip, makeInput({ left: true }), FIXED_DT);
    integrateShip(rightShip, makeInput({ right: true }), FIXED_DT);

    expect(leftShip.angle).toBeLessThan(0);
    expect(rightShip.angle).toBeGreaterThan(0);
  });

  it("caps speed at maximum ship speed", () => {
    const ship = createShipState({ slot: asPlayerSlot(0) });
    ship.vx = 900;
    ship.vy = 900;

    integrateShip(ship, makeInput({ thrust: true }), FIXED_DT);
    const speed = Math.hypot(ship.vx, ship.vy);
    expect(speed).toBeLessThanOrEqual(360 + 1e-6);
  });

  it("wraps ship coordinates cleanly at arena boundaries", () => {
    const world = createInitialWorldState({ seed: 101 });
    const ship = createShipState({ slot: asPlayerSlot(0), arena: world.arena });
    ship.x = world.arena.width - 1;
    ship.vx = 300;
    ship.angle = 0;

    integrateShip(ship, makeInput({ thrust: true }), FIXED_DT, world.arena);
    expect(ship.x).toBeGreaterThanOrEqual(0);
    expect(ship.x).toBeLessThan(world.arena.width);
  });

  it("decrements respawn timer when ship is dead and respawns after timeout", () => {
    const world = createInitialWorldState({ seed: 202, arena: { asteroidCount: 0 } });
    const ship = createShipState({ slot: asPlayerSlot(0), arena: world.arena });
    ship.alive = false;
    ship.respawnTimer = 0.1;
    world.ships.push(ship);

    stepWorld(world, new Map(), 0.05);
    expect(ship.alive).toBe(false);
    expect(ship.respawnTimer).toBeCloseTo(0.05, 5);

    stepWorld(world, new Map(), 0.1);
    expect(ship.alive).toBe(true);
    expect(ship.hp).toBe(ship.maxHp);
  });
});

describe("Shared: collisions, firing & stepWorld determinism", () => {
  it("spawns a bullet when firing and respects cooldown", () => {
    const world = createInitialWorldState({ seed: 303, arena: { asteroidCount: 0 } });
    const slot = asPlayerSlot(0);
    const ship = createShipState({ slot, arena: world.arena });
    world.ships.push(ship);

    const inputs = new Map<PlayerSlot, PlayerInput>([[slot, makeInput({ seq: asSeq(1), fire: true })]]);
    stepWorld(world, inputs, FIXED_DT);
    expect(world.bullets.length).toBe(1);

    stepWorld(world, inputs, FIXED_DT);
    expect(world.bullets.length).toBe(1);
  });

  it("handles bullet hit against enemy ship", () => {
    const world = createInitialWorldState({ seed: 404, arena: { asteroidCount: 0 } });
    const s0 = asPlayerSlot(0);
    const s1 = asPlayerSlot(1);
    const shooter = createShipState({ slot: s0, id: "p0", arena: world.arena });
    const target = createShipState({ slot: s1, id: "p1", arena: world.arena });
    shooter.x = 300;
    shooter.y = 300;
    shooter.angle = 0;
    target.x = 314;
    target.y = 300;
    world.ships.push(shooter, target);

    world.bullets.push({
      kind: "bullet",
      id: asEntityId(500),
      ownerSlot: s0,
      x: 312,
      y: 300,
      vx: 400,
      vy: 0,
      ttl: 1,
    });

    const initialHp = target.hp;
    stepWorld(world, new Map(), FIXED_DT);
    expect(target.hp).toBeLessThan(initialHp);
  });

  it("handles non-overlapping entities without false hits", () => {
    const world = createInitialWorldState({ seed: 505, arena: { asteroidCount: 0 } });
    const s0 = asPlayerSlot(0);
    const s1 = asPlayerSlot(1);
    const a = createShipState({ slot: s0, arena: world.arena });
    const b = createShipState({ slot: s1, arena: world.arena });
    a.x = 100;
    a.y = 100;
    b.x = 700;
    b.y = 500;
    world.ships.push(a, b);

    stepWorld(world, new Map(), FIXED_DT);
    expect(a.hp).toBe(a.maxHp);
    expect(b.hp).toBe(b.maxHp);
  });

  it("is deterministic across two cloned world states over 200 ticks", () => {
    const w1 = createInitialWorldState({ seed: 777 });
    const s0 = asPlayerSlot(0);
    const s1 = asPlayerSlot(1);
    w1.ships.push(
      createShipState({ slot: s0, id: "a", name: "A", arena: w1.arena }),
      createShipState({ slot: s1, id: "b", name: "B", arena: w1.arena })
    );
    const w2 = cloneWorld(w1);

    for (let t = 0; t < 200; t++) {
      const inputs = new Map<PlayerSlot, PlayerInput>([
        [s0, makeInput({ seq: asSeq(t + 1), tick: asTick(t), thrust: t % 2 === 0, fire: t % 12 === 0 })],
        [s1, makeInput({ seq: asSeq(t + 1), tick: asTick(t), right: t % 5 === 0, thrust: true })],
      ]);
      stepWorld(w1, inputs, FIXED_DT);
      stepWorld(w2, inputs, FIXED_DT);
    }

    expect(w1).toEqual(w2);
  });
});

describe("Shared: protocol validation & fast-check property tests", () => {
  it("validates well-formed client messages and rejects invalid payloads", () => {
    const valid = parseClientMessage({ type: "chat", text: "Hello arena" });
    expect(valid.ok).toBe(true);

    const invalid = parseClientMessage({ type: "chat", text: "" });
    expect(invalid.ok).toBe(false);

    expect(sanitizeInput({ type: "input", seq: 1, tick: 1, thrust: true, brake: false, left: false, right: false, fire: false })).not.toBeNull();
    expect(sanitizeInput({ type: "input", seq: -5, tick: 1, thrust: "yes" })).toBeNull();
  });

  it("Property 1: binary input round-trips all fields accurately", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 0xffffffff }),
        fc.nat({ max: 0xffffffff }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (seq, tick, thrust, brake, left, right, fire) => {
          const input: PlayerInput = {
            seq: asSeq(seq),
            tick: asTick(tick),
            thrust,
            brake,
            left,
            right,
            fire,
          };
          const decoded = decodeInputBinary(encodeInputBinary(input));
          expect(decoded).toEqual(input);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 2: binary snapshot length matches specification formula", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            slot: fc.integer({ min: 0, max: 15 }),
            alive: fc.boolean(),
            hp: fc.integer({ min: 0, max: 100 }),
            maxHp: fc.constant(100),
            score: fc.integer({ min: 0, max: 5000 }),
            x: fc.float({ min: 0, max: 960, noNaN: true }),
            y: fc.float({ min: 0, max: 640, noNaN: true }),
            angle: fc.float({ min: -3.14, max: 3.14, noNaN: true }),
            vx: fc.float({ min: -300, max: 300, noNaN: true }),
            vy: fc.float({ min: -300, max: 300, noNaN: true }),
          }),
          { minLength: 0, maxLength: 6 }
        ),
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 500 }),
            ownerSlot: fc.integer({ min: 0, max: 5 }),
            x: fc.float({ min: 0, max: 960, noNaN: true }),
            y: fc.float({ min: 0, max: 640, noNaN: true }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100 }),
            radius: fc.integer({ min: 10, max: 60 }),
            x: fc.float({ min: 0, max: 960, noNaN: true }),
            y: fc.float({ min: 0, max: 640, noNaN: true }),
          }),
          { minLength: 0, maxLength: 8 }
        ),
        (shipsRaw, bulletsRaw, asteroidsRaw) => {
          const ships: ShipSnapshot[] = shipsRaw.map((s) => ({
            kind: "ship",
            ...s,
            slot: asPlayerSlot(s.slot),
          }));
          const buf = encodeSnapshotBinary({
            tick: asTick(42),
            lastProcessedSeq: asSeq(10),
            serverTimeMs: 1234,
            yourSlot: asPlayerSlot(0),
            ships,
            bullets: bulletsRaw.map((b) => ({ kind: "bullet", ...b, id: asEntityId(b.id), ownerSlot: asPlayerSlot(b.ownerSlot) })),
            asteroids: asteroidsRaw.map((a) => ({ kind: "asteroid", ...a, id: asEntityId(a.id) })),
          });
          const expectedBytes = 18 + ships.length * 20 + bulletsRaw.length * 11 + asteroidsRaw.length * 11;
          expect(buf.byteLength).toBe(expectedBytes);
          const decoded = decodeSnapshotBinary(buf);
          expect(decoded.ships.length).toBe(ships.length);
        }
      ),
      { numRuns: 80 }
    );
  });

  it("Property 3: snapshot round-trip preserves quantized ship angle within tolerance", () => {
    fc.assert(
      fc.property(fc.float({ min: -3, max: 3, noNaN: true }), (rawAngle) => {
        const angle = normalizeAngle(rawAngle);
        const buf = encodeSnapshotBinary({
          tick: asTick(1),
          lastProcessedSeq: asSeq(1),
          serverTimeMs: 100,
          yourSlot: asPlayerSlot(0),
          ships: [
            {
              kind: "ship",
              slot: asPlayerSlot(0),
              alive: true,
              hp: 100,
              maxHp: 100,
              score: 0,
              x: 480,
              y: 320,
              angle,
              vx: 0,
              vy: 0,
            },
          ],
          bullets: [],
          asteroids: [],
        });
        const decoded = decodeSnapshotBinary(buf);
        const decodedAngle = decoded.ships[0]?.angle ?? 0;
        expect(Math.abs(normalizeAngle(decodedAngle - angle))).toBeLessThanOrEqual(0.02);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 4: arbitrary garbage buffers throw an Error cleanly without crashing", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 64 }), (bytes) => {
        expect(() => decodeInputBinary(bytes)).toThrow();
        expect(() => decodeSnapshotBinary(bytes)).toThrow();
      }),
      { numRuns: 100 }
    );
  });

  it("Property 5: ships stay inside arena bounds across random input sequences", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            thrust: fc.boolean(),
            brake: fc.boolean(),
            left: fc.boolean(),
            right: fc.boolean(),
            fire: fc.boolean(),
          }),
          { minLength: 20, maxLength: 120 }
        ),
        (seqList) => {
          const world = createInitialWorldState({ seed: 909, arena: { asteroidCount: 0 } });
          const slot = asPlayerSlot(0);
          const ship = createShipState({ slot, arena: world.arena });
          world.ships.push(ship);

          seqList.forEach((inp, idx) => {
            stepWorld(world, new Map([[slot, makeInput({ seq: asSeq(idx + 1), tick: asTick(idx), ...inp })]]), FIXED_DT);
            expect(ship.x).toBeGreaterThanOrEqual(0);
            expect(ship.x).toBeLessThan(world.arena.width);
            expect(ship.y).toBeGreaterThanOrEqual(0);
            expect(ship.y).toBeLessThan(world.arena.height);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it("Property 6: parseClientMessage accepts valid messages and rejects mutated invalid ones", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z0-9_-]{1,20}$/.test(s)),
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
        (roomId, text) => {
          const validChat = parseClientMessage({ type: "chat", text });
          expect(validChat.ok).toBe(true);

          const validJoin = parseClientMessage({ type: "join", roomId, name: "Ace" });
          expect(validJoin.ok).toBe(true);

          const invalidChat = parseClientMessage({ type: "chat", text: "   " });
          expect(invalidChat.ok).toBe(false);

          const invalidJoin = parseClientMessage({ type: "join", roomId: "bad room!", name: "Ace" });
          expect(invalidJoin.ok).toBe(false);
        }
      ),
      { numRuns: 80 }
    );
  });
});
