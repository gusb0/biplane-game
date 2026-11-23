import { ARENA_WIDTH, ARENA_HEIGHT, setArenaSize, findSafeSpawnPoint } from './arena.js';
import { Vector2 } from './vector.js';
import { Ship } from './ship.js';
import { Asteroid } from './asteroid.js';
import { Pickup } from './pickup.js';
import { Explosion } from './explosion.js';
import { detectCollisions } from './collision.js';
import { createHomingComponent } from './components.js';

function matchKinds(a, b, kind1, kind2) {
  if (a.kind === kind1 && b.kind === kind2) return [a, b];
  if (a.kind === kind2 && b.kind === kind1) return [b, a];
  return null;
}

export class World extends EventTarget {
  #entities = new Map();
  #pendingRemoval = new Set();

  constructor({ arenaConfig = {}, playerName = 'Pilot' } = {}) {
    super();
    this.arenaConfig = {
      name: arenaConfig.name || 'Standard Airspace',
      width: arenaConfig.width || 960,
      height: arenaConfig.height || 640,
      asteroidCount: arenaConfig.asteroidCount || 6,
      homingEvery: arenaConfig.homingEvery || 3,
      bgColor: arenaConfig.bgColor || '#0f172a',
      gridColor: arenaConfig.gridColor || 'rgba(148, 163, 184, 0.08)',
    };
    this.playerName = playerName;

    setArenaSize(this.arenaConfig.width, this.arenaConfig.height);

    this.score = 0;
    this.respawnTimer = 0;
    this.pickupSpawnTimer = 4.0;
    this.spawnCounter = 0;

    this.ship = new Ship({
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
    });
    this.spawn(this.ship);

    for (let i = 0; i < this.arenaConfig.asteroidCount; i++) {
      this.spawnRandomAsteroid(i === 2);
    }
  }

  get size() {
    return this.#entities.size;
  }

  get(id) {
    return this.#entities.get(id);
  }

  spawn(entity) {
    this.#entities.set(entity.id, entity);
    return entity;
  }

  despawn(id) {
    const entity = this.#entities.get(id);
    if (!entity) return;
    entity.alive = false;
    this.#pendingRemoval.add(id);
  }

  sweep() {
    for (const id of this.#pendingRemoval) {
      this.#entities.delete(id);
    }
    this.#pendingRemoval.clear();
  }

  *[Symbol.iterator]() {
    yield* this.#entities.values();
  }

  *ofKind(kind) {
    for (const entity of this) {
      if (entity.kind === kind) yield entity;
    }
  }

  addScore(delta, pos) {
    this.score += delta;
    this.dispatchEvent(
      new CustomEvent('scoreChanged', {
        detail: { score: this.score, delta, pos },
      })
    );
  }

  fireShipBullet() {
    const bullet = this.ship.fire();
    if (bullet) {
      this.spawn(bullet);
      this.dispatchEvent(
        new CustomEvent('fired', {
          detail: {
            x: bullet.pos.x,
            y: bullet.pos.y,
            homing: Boolean(bullet.homing),
          },
        })
      );
    }
    return bullet;
  }

  spawnRandomAsteroid(forceHoming = false) {
    this.spawnCounter += 1;
    const isHoming = forceHoming || this.spawnCounter % this.arenaConfig.homingEvery === 0;

    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) {
      x = Math.random() * ARENA_WIDTH;
      y = 20;
    } else if (edge === 1) {
      x = ARENA_WIDTH - 20;
      y = Math.random() * ARENA_HEIGHT;
    } else if (edge === 2) {
      x = Math.random() * ARENA_WIDTH;
      y = ARENA_HEIGHT - 20;
    } else {
      x = 20;
      y = Math.random() * ARENA_HEIGHT;
    }

    const angle = Math.random() * Math.PI * 2;
    const speed = isHoming ? 75 : 55 + Math.random() * 65;
    const vel = Vector2.fromAngle(angle, speed);

    const asteroid = new Asteroid({
      x,
      y,
      vx: vel.x,
      vy: vel.y,
      radius: isHoming ? 22 : 26,
      hp: 50,
      homing: isHoming
        ? createHomingComponent({
            targetKind: 'ship',
            turnRate: 1.6,
            maxRange: 550,
          })
        : null,
    });

    this.spawn(asteroid);
  }

  spawnRandomPickup() {
    const types = ['shield', 'rapidFire', 'homing'];
    const effectType = types[Math.floor(Math.random() * types.length)];
    const pos = findSafeSpawnPoint(this, 80);

    this.spawn(
      new Pickup({
        x: pos.x,
        y: pos.y,
        effectType,
        duration: 8,
      })
    );
  }

  handleShipDeath() {
    if (!this.ship.alive) return;
    this.despawn(this.ship.id);
    this.respawnTimer = 2.0;
    this.spawn(
      new Explosion({
        x: this.ship.pos.x,
        y: this.ship.pos.y,
        count: 34,
        colors: ['#38bdf8', '#facc15', '#f97316', '#ef4444'],
      })
    );
    this.dispatchEvent(
      new CustomEvent('exploded', {
        detail: { kind: 'ship', x: this.ship.pos.x, y: this.ship.pos.y },
      })
    );
  }

  resolveCollisions() {
    const pairs = detectCollisions(this);

    for (const [a, b] of pairs) {
      if (!a.alive || !b.alive) continue;

      const bulletAsteroid = matchKinds(a, b, 'bullet', 'asteroid');
      if (bulletAsteroid) {
        const [bullet, asteroid] = bulletAsteroid;
        this.despawn(bullet.id);
        asteroid.hp -= bullet.damage;

        this.dispatchEvent(
          new CustomEvent('hit', {
            detail: { x: bullet.pos.x, y: bullet.pos.y, damage: bullet.damage },
          })
        );

        this.spawn(
          new Explosion({
            x: bullet.pos.x,
            y: bullet.pos.y,
            count: 7,
            colors: ['#fde047', '#fb923c'],
          })
        );

        if (asteroid.hp <= 0) {
          this.despawn(asteroid.id);
          const pts = asteroid.isHoming ? 250 : 100;
          this.addScore(pts, asteroid.pos.clone());

          this.dispatchEvent(
            new CustomEvent('exploded', {
              detail: {
                kind: 'asteroid',
                homing: asteroid.isHoming,
                x: asteroid.pos.x,
                y: asteroid.pos.y,
              },
            })
          );

          this.spawn(
            new Explosion({
              x: asteroid.pos.x,
              y: asteroid.pos.y,
              count: 22,
              colors: asteroid.isHoming
                ? ['#f43f5e', '#fb7185', '#fde047']
                : ['#94a3b8', '#f97316', '#facc15'],
            })
          );
        }
        continue;
      }

      const shipAsteroid = matchKinds(a, b, 'ship', 'asteroid');
      if (shipAsteroid) {
        const [ship, asteroid] = shipAsteroid;
        this.despawn(asteroid.id);

        this.dispatchEvent(
          new CustomEvent('exploded', {
            detail: { kind: 'asteroid', x: asteroid.pos.x, y: asteroid.pos.y },
          })
        );

        this.spawn(
          new Explosion({
            x: asteroid.pos.x,
            y: asteroid.pos.y,
            count: 20,
          })
        );

        if (!ship.hasShield) {
          ship.takeDamage(35);
          if (ship.hp <= 0) {
            this.handleShipDeath();
          }
        }
        continue;
      }

      const shipPickup = matchKinds(a, b, 'ship', 'pickup');
      if (shipPickup) {
        const [ship, pickup] = shipPickup;
        ship.applyPickup(pickup.effect);
        this.addScore(50, pickup.pos.clone());
        this.despawn(pickup.id);

        this.dispatchEvent(
          new CustomEvent('pickup', {
            detail: {
              type: pickup.effect.type,
              x: pickup.pos.x,
              y: pickup.pos.y,
            },
          })
        );

        this.spawn(
          new Explosion({
            x: pickup.pos.x,
            y: pickup.pos.y,
            count: 14,
            colors: ['#34d399', '#38bdf8', '#fef08a'],
          })
        );
      }
    }
  }

  step(dt, input) {
    for (const entity of this) {
      entity.savePreviousState();
    }

    if (this.ship.alive) {
      this.ship.applyControls(input, dt);
      if (input.fire && this.ship.canFire()) {
        this.fireShipBullet();
      }
    } else {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        const safePos = findSafeSpawnPoint(this, 160);
        this.ship.respawn(safePos);
        this.spawn(this.ship);
      }
    }

    for (const entity of this) {
      if (entity.alive) {
        entity.update(dt, this);
      }
    }

    this.resolveCollisions();

    let asteroidCount = 0;
    for (const _ of this.ofKind('asteroid')) asteroidCount++;
    if (asteroidCount < this.arenaConfig.asteroidCount) {
      this.spawnRandomAsteroid();
    }

    let pickupCount = 0;
    for (const _ of this.ofKind('pickup')) pickupCount++;
    this.pickupSpawnTimer -= dt;
    if (this.pickupSpawnTimer <= 0 && pickupCount < 2) {
      this.spawnRandomPickup();
      this.pickupSpawnTimer = 8.0;
    }

    this.sweep();
  }
}