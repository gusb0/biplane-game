export type Brand<T, B extends string> = T & { readonly __brand: B };

export type EntityId = Brand<number, "EntityId">;
export type Tick = Brand<number, "Tick">;
export type Seq = Brand<number, "Seq">;
export type PlayerSlot = Brand<number, "PlayerSlot">;

export function asEntityId(value: number): EntityId {
  return value as EntityId; // Safe boundary constructor for numeric entity IDs
}

export function asTick(value: number): Tick {
  return value as Tick; // Safe boundary constructor for simulation ticks
}

export function asSeq(value: number): Seq {
  return value as Seq; // Safe boundary constructor for input sequence numbers
}

export function asPlayerSlot(value: number): PlayerSlot {
  return value as PlayerSlot; // Safe boundary constructor for arena player slots
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface ArenaConfig {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly asteroidCount: number;
  readonly bgColor: string;
  readonly gridColor: string;
}

export interface ShipEntity {
  readonly kind: "ship";
  readonly slot: PlayerSlot;
  readonly id: string;
  readonly name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  readonly maxHp: number;
  score: number;
  alive: boolean;
  respawnTimer: number;
  fireCooldown: number;
}

export interface BulletEntity {
  readonly kind: "bullet";
  readonly id: EntityId;
  readonly ownerSlot: PlayerSlot;
  x: number;
  y: number;
  readonly vx: number;
  readonly vy: number;
  ttl: number;
}

export interface AsteroidEntity {
  readonly kind: "asteroid";
  readonly id: EntityId;
  readonly radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type WorldEntity = ShipEntity | BulletEntity | AsteroidEntity;

export interface ShipSnapshot {
  readonly kind: "ship";
  readonly slot: PlayerSlot;
  readonly alive: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly score: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly vx: number;
  readonly vy: number;
  readonly name?: string;
}

export interface BulletSnapshot {
  readonly kind: "bullet";
  readonly id: EntityId;
  readonly ownerSlot: PlayerSlot;
  readonly x: number;
  readonly y: number;
}

export interface AsteroidSnapshot {
  readonly kind: "asteroid";
  readonly id: EntityId;
  readonly radius: number;
  readonly x: number;
  readonly y: number;
}

export type SnapshotEntity = ShipSnapshot | BulletSnapshot | AsteroidSnapshot;

export interface PlayerInput {
  readonly seq: Seq;
  readonly tick: Tick;
  readonly thrust: boolean;
  readonly brake: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly fire: boolean;
}

export interface SeededRng {
  getState(): number;
  setState(nextState: number): void;
  next(): number;
  range(min: number, max: number): number;
}

export interface WorldState {
  tick: Tick;
  readonly seed: number;
  rngState: number;
  nextEntityId: number;
  readonly arena: ArenaConfig;
  ships: ShipEntity[];
  bullets: BulletEntity[];
  asteroids: AsteroidEntity[];
}

export type SimEvent =
  | { readonly type: "respawn"; readonly slot: PlayerSlot }
  | { readonly type: "fire"; readonly slot: PlayerSlot; readonly bulletId: EntityId }
  | { readonly type: "hit"; readonly targetSlot: PlayerSlot; readonly x: number; readonly y: number }
  | {
      readonly type: "kill";
      readonly killerSlot: PlayerSlot;
      readonly victimSlot: PlayerSlot;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: "asteroidHit"; readonly slot: PlayerSlot; readonly x: number; readonly y: number }
  | { readonly type: "collision"; readonly slot: PlayerSlot; readonly x: number; readonly y: number };

export interface SnapshotMessage {
  readonly type: "snapshot";
  readonly v: 1;
  readonly tick: Tick;
  readonly lastProcessedSeq: Seq;
  readonly serverTimeMs: number;
  readonly yourSlot: PlayerSlot;
  readonly ships: readonly ShipSnapshot[];
  readonly bullets: readonly BulletSnapshot[];
  readonly asteroids: readonly AsteroidSnapshot[];
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };