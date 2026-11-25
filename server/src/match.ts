import {
  asPlayerSlot,
  asSeq,
  createInitialWorldState,
  createShipState,
  DEFAULT_ARENA,
  FIXED_DT,
  sanitizeInput,
  SERVER_TICK_RATE,
  stepWorld,
} from "@biplane/shared";
import type {
  ArenaConfig,
  PlayerInput,
  PlayerSlot,
  Seq,
  SnapshotMessage,
  WorldState,
} from "@biplane/shared";

export interface MatchStats {
  readonly tickRateHz: number;
  ticksTotal: number;
  lastTickDurationMs: number;
  avgTickDurationMs: number;
  maxTickDurationMs: number;
  avgJitterMs: number;
  maxJitterMs: number;
}

export interface MatchPlayerIdentity {
  readonly id: string;
  readonly name: string;
}

export class AuthoritativeMatch {
  readonly roomId: string;
  readonly arena: ArenaConfig;
  readonly seed: number;
  readonly world: WorldState;

  private readonly stepMs = 1000 / SERVER_TICK_RATE;
  private readonly onBroadcastSnapshot?: (playerId: string, snapshot: SnapshotMessage) => void;
  private readonly inputQueues = new Map<PlayerSlot, PlayerInput[]>();
  private readonly lastProcessedSeq = new Map<PlayerSlot, Seq>();

  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextTargetTime = 0;
  private lastTickStart = 0;

  readonly stats: MatchStats = {
    tickRateHz: SERVER_TICK_RATE,
    ticksTotal: 0,
    lastTickDurationMs: 0,
    avgTickDurationMs: 0,
    maxTickDurationMs: 0,
    avgJitterMs: 0,
    maxJitterMs: 0,
  };

  constructor({
    roomId,
    arena = DEFAULT_ARENA,
    onBroadcastSnapshot,
  }: {
    roomId: string;
    arena?: ArenaConfig;
    onBroadcastSnapshot?: (playerId: string, snapshot: SnapshotMessage) => void;
  }) {
    this.roomId = roomId;
    this.arena = arena;
    this.onBroadcastSnapshot = onBroadcastSnapshot;
    this.seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 424242;
    this.world = createInitialWorldState({ seed: this.seed, arena });
  }

  get isRunning(): boolean {
    return this.running;
  }

  addPlayer(player: MatchPlayerIdentity): PlayerSlot {
    const usedSlots = new Set<number>(this.world.ships.map((s) => Number(s.slot)));
    let slotNum = 0;
    while (usedSlots.has(slotNum)) slotNum += 1;
    const slot = asPlayerSlot(slotNum);

    const ship = createShipState({
      slot,
      id: player.id,
      name: player.name,
      arena: this.world.arena,
    });
    this.world.ships.push(ship);
    this.inputQueues.set(slot, []);
    this.lastProcessedSeq.set(slot, asSeq(0));

    if (!this.running) {
      this.start();
    }
    return slot;
  }

  removePlayerById(playerId: string): void {
    const idx = this.world.ships.findIndex((s) => s.id === playerId);
    if (idx === -1) return;
    const [removed] = this.world.ships.splice(idx, 1);
    if (removed) {
      this.inputQueues.delete(removed.slot);
      this.lastProcessedSeq.delete(removed.slot);
    }
    if (this.world.ships.length === 0) {
      this.stop();
    }
  }

  enqueueInput(slot: PlayerSlot, rawInput: unknown): void {
    const clean = sanitizeInput(rawInput);
    if (!clean) return;
    const queue = this.inputQueues.get(slot);
    if (!queue) return;

    const lastAck = this.lastProcessedSeq.get(slot) ?? asSeq(0);
    if (Number(clean.seq) <= Number(lastAck)) return;

    if (queue.length < 30) {
      queue.push(clean);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const now = performance.now();
    this.lastTickStart = now;
    this.nextTargetTime = now + this.stepMs;
    this.timer = setTimeout(() => this.tick(), this.stepMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (!this.running) return;

    const tickStart = performance.now();
    const intervalJitter = Math.abs(tickStart - this.lastTickStart - this.stepMs);
    this.lastTickStart = tickStart;

    const inputsBySlot = new Map<PlayerSlot, PlayerInput>();
    for (const [slot, queue] of this.inputQueues.entries()) {
      const nextInput = queue.shift();
      if (nextInput) {
        inputsBySlot.set(slot, nextInput);
        this.lastProcessedSeq.set(slot, nextInput.seq);
      }
    }

    stepWorld(this.world, inputsBySlot, FIXED_DT);

    for (const ship of this.world.ships) {
      const snapshot: SnapshotMessage = {
        type: "snapshot",
        v: 1,
        tick: this.world.tick,
        lastProcessedSeq: this.lastProcessedSeq.get(ship.slot) ?? asSeq(0),
        serverTimeMs: tickStart,
        yourSlot: ship.slot,
        ships: this.world.ships.map((s) => ({
          kind: "ship",
          slot: s.slot,
          alive: s.alive,
          hp: s.hp,
          maxHp: s.maxHp,
          score: s.score,
          x: s.x,
          y: s.y,
          angle: s.angle,
          vx: s.vx,
          vy: s.vy,
          name: s.name,
        })),
        bullets: this.world.bullets.map((b) => ({
          kind: "bullet",
          id: b.id,
          ownerSlot: b.ownerSlot,
          x: b.x,
          y: b.y,
        })),
        asteroids: this.world.asteroids.map((a) => ({
          kind: "asteroid",
          id: a.id,
          radius: a.radius,
          x: a.x,
          y: a.y,
        })),
      };
      this.onBroadcastSnapshot?.(ship.id, snapshot);
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

    this.nextTargetTime += this.stepMs;
    const nowAfter = performance.now();
    if (this.nextTargetTime < nowAfter - this.stepMs) {
      this.nextTargetTime = nowAfter + this.stepMs;
    }
    const delay = Math.max(0, this.nextTargetTime - nowAfter);
    this.timer = setTimeout(() => this.tick(), delay);
  }
}