import { createRng } from './prng.js';
import { FIXED_DT } from './protocol.js';

export const DEFAULT_ARENA = Object.freeze({
  name: 'Sky Patrol',
  width: 960,
  height: 640,
  asteroidCount: 6,
  bgColor: '#0f172a',
  gridColor: 'rgba(56, 189, 248, 0.08)',
});

const SHIP_RADIUS = 16;
const SHIP_ACCEL = 320;
const SHIP_BRAKE = 220;
const SHIP_MAX_SPEED = 360;
const SHIP_DRAG = 0.985;
const SHIP_TURN_SPEED = 3.4;
const BULLET_SPEED = 560;
const BULLET_TTL = 1.35;
const FIRE_COOLDOWN = 0.24;
const RESPAWN_SECONDS = 2.5;

export function normalizeAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function wrapCoord(val, max) {
  if (val < 0) return val + max;
  if (val >= max) return val - max;
  return val;
}

export function createShipState({ slot, id = '', name = `Pilot-${slot + 1}`, arena = DEFAULT_ARENA }) {
  const spawnPositions = [
    { x: arena.width * 0.22, y: arena.height * 0.5, angle: 0 },
    { x: arena.width * 0.78, y: arena.height * 0.5, angle: Math.PI },
    { x: arena.width * 0.5, y: arena.height * 0.2, angle: Math.PI / 2 },
    { x: arena.width * 0.5, y: arena.height * 0.8, angle: -Math.PI / 2 },
    { x: arena.width * 0.25, y: arena.height * 0.25, angle: Math.PI / 4 },
    { x: arena.width * 0.75, y: arena.height * 0.75, angle: (-3 * Math.PI) / 4 },
  ];
  const sp = spawnPositions[slot % spawnPositions.length];
  return {
    slot,
    id,
    name,
    x: sp.x,
    y: sp.y,
    vx: 0,
    vy: 0,
    angle: sp.angle,
    hp: 100,
    maxHp: 100,
    score: 0,
    alive: true,
    respawnTimer: 0,
    fireCooldown: 0,
  };
}

export function createInitialWorldState({ seed = 424242, arena = DEFAULT_ARENA } = {}) {
  const cfg = { ...DEFAULT_ARENA, ...arena };
  const rng = createRng(seed);
  const asteroids = [];

  for (let i = 0; i < cfg.asteroidCount; i++) {
    const radius = Math.round(rng.range(20, 36));
    let x = rng.range(60, cfg.width - 60);
    let y = rng.range(60, cfg.height - 60);
    if (Math.hypot(x - cfg.width * 0.5, y - cfg.height * 0.5) < 90) {
      x = wrapCoord(x + 180, cfg.width);
    }
    const dir = rng.range(-Math.PI, Math.PI);
    const speed = rng.range(28, 68);
    asteroids.push({
      id: i + 1,
      x,
      y,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      radius,
    });
  }

  return {
    tick: 0,
    seed: seed >>> 0,
    rngState: rng.getState(),
    nextEntityId: 100,
    arena: cfg,
    ships: [],
    bullets: [],
    asteroids,
  };
}

/**
 * Pure deterministic ship integration shared by server reconciliation and client prediction.
 */
export function integrateShip(ship, input, dt = FIXED_DT, arena = DEFAULT_ARENA, debugJitterFn = null) {
  if (!ship.alive) {
    ship.respawnTimer = Math.max(0, ship.respawnTimer - dt);
    return ship;
  }

  if (ship.fireCooldown > 0) {
    ship.fireCooldown = Math.max(0, ship.fireCooldown - dt);
  }

  const turnDir = (input?.right ? 1 : 0) - (input?.left ? 1 : 0);
  ship.angle = normalizeAngle(ship.angle + turnDir * SHIP_TURN_SPEED * dt);

  const cos = Math.cos(ship.angle);
  const sin = Math.sin(ship.angle);

  if (input?.thrust) {
    ship.vx += cos * SHIP_ACCEL * dt;
    ship.vy += sin * SHIP_ACCEL * dt;
  }
  if (input?.brake) {
    ship.vx -= cos * SHIP_BRAKE * dt;
    ship.vy -= sin * SHIP_BRAKE * dt;
  }

  const dragFactor = Math.pow(SHIP_DRAG, dt * 60);
  ship.vx *= dragFactor;
  ship.vy *= dragFactor;

  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > SHIP_MAX_SPEED) {
    const scale = SHIP_MAX_SPEED / speed;
    ship.vx *= scale;
    ship.vy *= scale;
  }

  if (debugJitterFn) {
    ship.vx += debugJitterFn();
  }

  ship.x = wrapCoord(ship.x + ship.vx * dt, arena.width);
  ship.y = wrapCoord(ship.y + ship.vy * dt, arena.height);
  return ship;
}

export function stepWorld(state, inputsBySlot = new Map(), dt = FIXED_DT) {
  const events = [];
  const arena = state.arena;
  const rng = createRng(state.rngState);

  state.tick += 1;

  // Deterministic order: always sorted by numeric slot
  state.ships.sort((a, b) => a.slot - b.slot);

  for (const ship of state.ships) {
    const inp = inputsBySlot.get(ship.slot) || null;

    if (!ship.alive) {
      ship.respawnTimer -= dt;
      if (ship.respawnTimer <= 0) {
        const fresh = createShipState({ slot: ship.slot, id: ship.id, name: ship.name, arena });
        ship.x = fresh.x;
        ship.y = fresh.y;
        ship.vx = 0;
        ship.vy = 0;
        ship.angle = fresh.angle;
        ship.hp = ship.maxHp;
        ship.alive = true;
        ship.respawnTimer = 0;
        events.push({ type: 'respawn', slot: ship.slot });
      }
      continue;
    }

    integrateShip(ship, inp, dt, arena);

    if (inp?.fire && ship.fireCooldown <= 0) {
      ship.fireCooldown = FIRE_COOLDOWN;
      const muzzleDist = SHIP_RADIUS + 8;
      const bulletId = state.nextEntityId++;
      if (state.nextEntityId > 65000) state.nextEntityId = 100;

      state.bullets.push({
        id: bulletId,
        ownerSlot: ship.slot,
        x: wrapCoord(ship.x + Math.cos(ship.angle) * muzzleDist, arena.width),
        y: wrapCoord(ship.y + Math.sin(ship.angle) * muzzleDist, arena.height),
        vx: ship.vx * 0.35 + Math.cos(ship.angle) * BULLET_SPEED,
        vy: ship.vy * 0.35 + Math.sin(ship.angle) * BULLET_SPEED,
        ttl: BULLET_TTL,
      });
      events.push({ type: 'fire', slot: ship.slot, bulletId });
    }
  }

  for (const ast of state.asteroids) {
    ast.x = wrapCoord(ast.x + ast.vx * dt, arena.width);
    ast.y = wrapCoord(ast.y + ast.vy * dt, arena.height);
  }

  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.ttl -= dt;
    if (b.ttl <= 0) {
      state.bullets.splice(i, 1);
      continue;
    }
    b.x = wrapCoord(b.x + b.vx * dt, arena.width);
    b.y = wrapCoord(b.y + b.vy * dt, arena.height);

    let consumed = false;

    // Bullet vs Ship
    for (const ship of state.ships) {
      if (!ship.alive || ship.slot === b.ownerSlot) continue;
      if (Math.hypot(ship.x - b.x, ship.y - b.y) <= SHIP_RADIUS + 4) {
        ship.hp = Math.max(0, ship.hp - 25);
        consumed = true;
        const attacker = state.ships.find((s) => s.slot === b.ownerSlot);
        if (ship.hp === 0) {
          ship.alive = false;
          ship.respawnTimer = RESPAWN_SECONDS;
          if (attacker) attacker.score += 100;
          events.push({ type: 'kill', killerSlot: b.ownerSlot, victimSlot: ship.slot, x: ship.x, y: ship.y });
        } else {
          if (attacker) attacker.score += 15;
          events.push({ type: 'hit', targetSlot: ship.slot, x: ship.x, y: ship.y });
        }
        break;
      }
    }

    if (consumed) {
      state.bullets.splice(i, 1);
      continue;
    }

    // Bullet vs Asteroid
    for (const ast of state.asteroids) {
      if (Math.hypot(ast.x - b.x, ast.y - b.y) <= ast.radius + 3) {
        consumed = true;
        const attacker = state.ships.find((s) => s.slot === b.ownerSlot);
        if (attacker) attacker.score += 10;
        const dir = rng.range(-Math.PI, Math.PI);
        const speed = rng.range(30, 72);
        ast.x = wrapCoord(ast.x + Math.cos(dir) * 95, arena.width);
        ast.y = wrapCoord(ast.y + Math.sin(dir) * 95, arena.height);
        ast.vx = Math.cos(dir) * speed;
        ast.vy = Math.sin(dir) * speed;
        events.push({ type: 'asteroidHit', slot: b.ownerSlot, x: b.x, y: b.y });
        break;
      }
    }

    if (consumed) {
      state.bullets.splice(i, 1);
    }
  }

  // Ship vs Asteroid bounce + minor damage
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    for (const ast of state.asteroids) {
      const dx = ship.x - ast.x;
      const dy = ship.y - ast.y;
      const dist = Math.hypot(dx, dy);
      const minDist = SHIP_RADIUS + ast.radius;
      if (dist > 0 && dist < minDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        ship.x = wrapCoord(ast.x + nx * (minDist + 2), arena.width);
        ship.y = wrapCoord(ast.y + ny * (minDist + 2), arena.height);
        ship.vx = nx * 160;
        ship.vy = ny * 160;
        ship.hp = Math.max(0, ship.hp - 10);
        if (ship.hp === 0) {
          ship.alive = false;
          ship.respawnTimer = RESPAWN_SECONDS;
        }
        events.push({ type: 'collision', slot: ship.slot, x: ship.x, y: ship.y });
      }
    }
  }

  state.rngState = rng.getState();
  return events;
}

export function cloneSimulationState(state) {
  return structuredClone(state);
}