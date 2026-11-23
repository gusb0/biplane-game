import {
  SERVER_TICK_RATE,
  FIXED_DT,
  createInitialWorldState,
  createShipState,
  stepWorld,
  sanitizeInput,
  encodeSnapshotBinary,
} from '@biplane/shared';

export class AuthoritativeMatch {
  constructor({ room, onBroadcastSnapshot }) {
    this.room = room;
    this.onBroadcastSnapshot = onBroadcastSnapshot;
    this.stepMs = 1000 / SERVER_TICK_RATE;
    this.seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 424242;
    this.world = createInitialWorldState({ seed: this.seed, arena: room.arena });

    this.running = false;
    this.timer = null;
    this.nextTargetTime = 0;
    this.lastTickStart = 0;

    // slot -> Array<validatedInput>
    this.inputQueues = new Map();
    // slot -> lastProcessedSeq
    this.lastProcessedSeq = new Map();

    // Telemetry for /api/stats
    this.stats = {
      tickRateHz: SERVER_TICK_RATE,
      ticksTotal: 0,
      lastTickDurationMs: 0,
      avgTickDurationMs: 0,
      maxTickDurationMs: 0,
      avgJitterMs: 0,
      maxJitterMs: 0,
    };
  }

  addPlayer(player) {
    const usedSlots = new Set(this.world.ships.map((s) => s.slot));
    let slot = 0;
    while (usedSlots.has(slot)) slot += 1;

    const ship = createShipState({
      slot,
      id: player.id,
      name: player.name,
      arena: this.world.arena,
    });
    this.world.ships.push(ship);
    this.inputQueues.set(slot, []);
    this.lastProcessedSeq.set(slot, 0);

    if (!this.running) {
      this.start();
    }
    return slot;
  }

  removePlayerById(playerId) {
    const idx = this.world.ships.findIndex((s) => s.id === playerId);
    if (idx === -1) return;
    const [removed] = this.world.ships.splice(idx, 1);
    this.inputQueues.delete(removed.slot);
    this.lastProcessedSeq.delete(removed.slot);

    if (this.world.ships.length === 0) {
      this.stop();
    }
  }

  enqueueInput(slot, rawInput) {
    const clean = sanitizeInput(rawInput);
    if (!clean) return;
    const queue = this.inputQueues.get(slot);
    if (!queue) return;

    const lastAck = this.lastProcessedSeq.get(slot) || 0;
    if (clean.seq <= lastAck) return;

    if (queue.length < 30) {
      queue.push(clean);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    const now = performance.now();
    this.lastTickStart = now;
    this.nextTargetTime = now + this.stepMs;
    this.timer = setTimeout(() => this.#tick(), this.stepMs);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  #tick() {
    if (!this.running) return;

    const tickStart = performance.now();
    const intervalJitter = Math.abs(tickStart - this.lastTickStart - this.stepMs);
    this.lastTickStart = tickStart;

    const inputsBySlot = new Map();
    for (const [slot, queue] of this.inputQueues.entries()) {
      if (queue.length > 0) {
        const nextInput = queue.shift();
        inputsBySlot.set(slot, nextInput);
        this.lastProcessedSeq.set(slot, nextInput.seq);
      }
    }

    const events = stepWorld(this.world, inputsBySlot, FIXED_DT);

    // Build personalized snapshots per connected player in room
    for (const ship of this.world.ships) {
      const snapshotObj = {
        tick: this.world.tick,
        lastProcessedSeq: this.lastProcessedSeq.get(ship.slot) || 0,
        serverTimeMs: tickStart,
        yourSlot: ship.slot,
        ships: this.world.ships,
        bullets: this.world.bullets,
        asteroids: this.world.asteroids,
        events,
      };
      this.onBroadcastSnapshot?.(ship.id, snapshotObj);
    }

    const tickDuration = performance.now() - tickStart;
    this.stats.ticksTotal += 1;
    this.stats.lastTickDurationMs = Number(tickDuration.toFixed(3));
    this.stats.avgTickDurationMs = Number(
      (this.stats.avgTickDurationMs * 0.95 + tickDuration * 0.05).toFixed(3)
    );
    this.stats.maxTickDurationMs = Number(
      Math.max(this.stats.maxTickDurationMs, tickDuration).toFixed(3)
    );
    this.stats.avgJitterMs = Number(
      (this.stats.avgJitterMs * 0.95 + intervalJitter * 0.05).toFixed(3)
    );
    this.stats.maxJitterMs = Number(
      Math.max(this.stats.maxJitterMs, intervalJitter).toFixed(3)
    );

    // Absolute-target scheduling (prevents setInterval drift)
    this.nextTargetTime += this.stepMs;
    const nowAfter = performance.now();
    if (this.nextTargetTime < nowAfter - this.stepMs) {
      this.nextTargetTime = nowAfter + this.stepMs;
    }
    const delay = Math.max(0, this.nextTargetTime - nowAfter);
    this.timer = setTimeout(() => this.#tick(), delay);
  }
}