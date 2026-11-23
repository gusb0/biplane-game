import { Entity } from './entity.js';
import { Vector2 } from './vector.js';
import { Bullet } from './bullet.js';
import { createHomingComponent } from './components.js';

export class Ship extends Entity {
  #hp = 100;
  #maxHp = 100;

  constructor({ x, y }) {
    super({
      x,
      y,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      radius: 18,
      kind: 'ship',
    });

    this.thrustPower = 360;
    this.turnSpeed = 3.6;
    this.maxSpeed = 340;
    this.drag = 0.985;

    this.fireCooldown = 0;
    this.shieldTimer = 2.0; // Короткий щит на старті
    this.rapidFireTimer = 0;
    this.homingTimer = 0;
    this.manualHoming = false;
    this.propellerPhase = 0;
  }

  get hp() {
    return this.#hp;
  }

  get maxHp() {
    return this.#maxHp;
  }

  get hasShield() {
    return this.shieldTimer > 0;
  }

  get hasRapidFire() {
    return this.rapidFireTimer > 0;
  }

  get hasHoming() {
    return this.homingTimer > 0 || this.manualHoming;
  }

  takeDamage(amount) {
    if (this.hasShield || !this.alive) return;
    this.#hp = Math.max(0, this.#hp - amount);
  }

  applyPickup(effect) {
    if (effect.type === 'shield') {
      this.shieldTimer = Math.max(this.shieldTimer, effect.duration);
    } else if (effect.type === 'rapidFire') {
      this.rapidFireTimer = Math.max(this.rapidFireTimer, effect.duration);
    } else if (effect.type === 'homing') {
      this.homingTimer = Math.max(this.homingTimer, effect.duration);
    }
  }

  respawn(pos) {
    this.pos = pos.clone();
    this.prevPos = pos.clone();
    this.vel = new Vector2(0, 0);
    this.angle = -Math.PI / 2;
    this.prevAngle = this.angle;
    this.#hp = this.#maxHp;
    this.alive = true;
    this.fireCooldown = 0;
    this.shieldTimer = 2.5;
  }

  canFire() {
    return this.alive && this.fireCooldown <= 0;
  }

  // Звичайний метод прототипу: якщо передати ship.fire без прив'язки this, this стане undefined!
  fire() {
    if (!this.canFire()) return null;

    const cooldown = this.hasRapidFire ? 0.11 : 0.24;
    this.fireCooldown = cooldown;

    const noseOffset = Vector2.fromAngle(this.angle, this.radius + 8);
    const spawnPos = this.pos.add(noseOffset);
    const bulletSpeed = 520;
    const bulletVel = this.vel.add(Vector2.fromAngle(this.angle, bulletSpeed));

    const homingComponent = this.hasHoming
      ? createHomingComponent({
          targetKind: 'asteroid',
          turnRate: 4.8,
          maxRange: 480,
        })
      : null;

    return new Bullet({
      x: spawnPos.x,
      y: spawnPos.y,
      vx: bulletVel.x,
      vy: bulletVel.y,
      angle: this.angle,
      ownerId: this.id,
      ttl: 1.5,
      damage: 25,
      homing: homingComponent,
    });
  }

  applyControls(input, dt) {
    if (input.left) this.angle -= this.turnSpeed * dt;
    if (input.right) this.angle += this.turnSpeed * dt;

    if (input.thrust) {
      const accel = Vector2.fromAngle(this.angle, this.thrustPower * dt);
      this.vel = this.vel.add(accel);
    }

    if (input.brake) {
      this.vel = this.vel.scale(0.94);
    }

    const speed = this.vel.length();
    if (speed > this.maxSpeed) {
      this.vel = this.vel.normalize().scale(this.maxSpeed);
    }
  }

  update(dt) {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.shieldTimer > 0) this.shieldTimer -= dt;
    if (this.rapidFireTimer > 0) this.rapidFireTimer -= dt;
    if (this.homingTimer > 0) this.homingTimer -= dt;

    this.propellerPhase += dt * (18 + this.vel.length() * 0.08);
    this.vel = this.vel.scale(this.drag);

    super.update(dt);
  }
}