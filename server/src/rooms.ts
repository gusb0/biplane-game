import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { asPlayerSlot, DEFAULT_ARENA } from "@biplane/shared";
import type { ArenaConfig, PlayerSlot, SnapshotMessage } from "@biplane/shared";
import { AuthoritativeMatch } from "./match.js";

export interface RoomPlayer {
  readonly id: string;
  readonly name: string;
  slot: PlayerSlot;
  readonly joinedAt: number;
}

export interface ChatMessageRecord {
  readonly id: string;
  readonly playerId: string;
  readonly name: string;
  readonly text: string;
  readonly t: number;
}

export interface MatchLogEvent {
  readonly t: number;
  readonly roomId: string;
  readonly type: "join" | "leave" | "chat" | "empty";
  readonly playerId?: string;
  readonly slot?: PlayerSlot;
  readonly name?: string;
  readonly count?: number;
  readonly text?: string;
}

export interface RoomSummary {
  readonly id: string;
  readonly name: string;
  readonly players: number;
  readonly maxPlayers: number;
  readonly seed: number;
  readonly arena: ArenaConfig;
}

export interface HttpError extends Error {
  status: number;
}

function makeHttpError(status: number, message: string): HttpError {
  const err = new Error(message) as HttpError; // Attach HTTP status code for JSON error response
  err.status = status;
  return err;
}

export class Room extends EventEmitter {
  readonly id: string;
  readonly name: string;
  readonly maxPlayers: number;
  readonly persistent: boolean;
  readonly createdAt = Date.now();
  readonly players = new Map<string, RoomPlayer>();
  readonly arena: ArenaConfig;
  readonly match: AuthoritativeMatch;

  constructor({
    id,
    name,
    maxPlayers = 6,
    arena = {},
    persistent = false,
    onBroadcastSnapshot,
  }: {
    id: string;
    name: string;
    maxPlayers?: number;
    arena?: Partial<ArenaConfig>;
    persistent?: boolean;
    onBroadcastSnapshot?: (playerId: string, snapshot: SnapshotMessage) => void;
  }) {
    super();
    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.persistent = persistent;
    this.arena = {
      name: arena.name ?? name,
      width: Number(arena.width) || DEFAULT_ARENA.width,
      height: Number(arena.height) || DEFAULT_ARENA.height,
      asteroidCount: Number(arena.asteroidCount) || DEFAULT_ARENA.asteroidCount,
      bgColor: arena.bgColor ?? DEFAULT_ARENA.bgColor,
      gridColor: arena.gridColor ?? DEFAULT_ARENA.gridColor,
    };

    this.match = new AuthoritativeMatch({
      roomId: this.id,
      arena: this.arena,
      onBroadcastSnapshot,
    });
  }

  get roster(): RoomPlayer[] {
    return Array.from(this.players.values());
  }

  private recordEvent(type: MatchLogEvent["type"], detail: Omit<MatchLogEvent, "t" | "roomId" | "type">): void {
    const evt: MatchLogEvent = { t: Date.now(), roomId: this.id, type, ...detail };
    this.emit("event", evt);
  }

  join(playerName: string): RoomPlayer | null {
    if (this.players.size >= this.maxPlayers) return null;

    const player: RoomPlayer = {
      id: crypto.randomUUID().slice(0, 8),
      name: playerName,
      slot: asPlayerSlot(0),
      joinedAt: Date.now(),
    };
    player.slot = this.match.addPlayer(player);
    this.players.set(player.id, player);
    this.recordEvent("join", {
      playerId: player.id,
      slot: player.slot,
      name: player.name,
      count: this.players.size,
    });
    this.emit("join", player);
    return player;
  }

  leave(playerId: string): RoomPlayer | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    this.players.delete(playerId);
    this.match.removePlayerById(playerId);
    this.recordEvent("leave", { playerId: player.id, name: player.name, count: this.players.size });
    this.emit("leave", player);

    if (this.players.size === 0) {
      this.recordEvent("empty", {});
      this.emit("empty");
    }
    return player;
  }

  chat(playerId: string, text: string): ChatMessageRecord | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    const message: ChatMessageRecord = {
      id: crypto.randomUUID().slice(0, 8),
      playerId: player.id,
      name: player.name,
      text,
      t: Date.now(),
    };

    this.recordEvent("chat", { playerId: player.id, name: player.name, text });
    this.emit("chat", message);
    return message;
  }

  toJSON(): RoomSummary {
    return {
      id: this.id,
      name: this.name,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
      seed: this.match.seed,
      arena: this.arena,
    };
  }
}

export class RoomManager extends EventEmitter {
  readonly maxRooms: number;
  readonly defaultMaxPlayers: number;
  readonly rooms = new Map<string, Room>();
  private readonly onRoomCreated?: (room: Room) => void;
  private readonly onBroadcastSnapshot?: (playerId: string, snapshot: SnapshotMessage) => void;

  constructor({
    maxRooms = 20,
    defaultMaxPlayers = 6,
    onRoomCreated,
    onBroadcastSnapshot,
  }: {
    maxRooms?: number;
    defaultMaxPlayers?: number;
    onRoomCreated?: (room: Room) => void;
    onBroadcastSnapshot?: (playerId: string, snapshot: SnapshotMessage) => void;
  } = {}) {
    super();
    this.maxRooms = maxRooms;
    this.defaultMaxPlayers = defaultMaxPlayers;
    this.onRoomCreated = onRoomCreated;
    this.onBroadcastSnapshot = onBroadcastSnapshot;

    this.createRoom({
      id: "sky-patrol",
      name: "Sky Patrol (30 Hz)",
      maxPlayers: defaultMaxPlayers,
      persistent: true,
      arena: {
        name: "Sky Patrol",
        width: 960,
        height: 640,
        asteroidCount: 6,
        bgColor: "#0f172a",
        gridColor: "rgba(56, 189, 248, 0.08)",
      },
    });

    this.createRoom({
      id: "red-baron-canyon",
      name: "Red Baron Canyon",
      maxPlayers: defaultMaxPlayers,
      persistent: true,
      arena: {
        name: "Red Baron Canyon",
        width: 960,
        height: 640,
        asteroidCount: 9,
        bgColor: "#1c1917",
        gridColor: "rgba(251, 146, 60, 0.09)",
      },
    });
  }

  get size(): number {
    return this.rooms.size;
  }

  getRoom(id: string): Room | null {
    return this.rooms.get(id) ?? null;
  }

  listRooms(): RoomSummary[] {
    return Array.from(this.rooms.values()).map((r) => r.toJSON());
  }

  getMatchStats() {
    return Array.from(this.rooms.values()).map((r) => ({
      roomId: r.id,
      players: r.players.size,
      running: r.match.isRunning,
      ...r.match.stats,
    }));
  }

  createRoom({
    id,
    name,
    maxPlayers,
    arena,
    persistent = false,
  }: {
    id?: string;
    name: unknown;
    maxPlayers?: unknown;
    arena?: Partial<ArenaConfig>;
    persistent?: boolean;
  }): Room {
    if (this.rooms.size >= this.maxRooms) {
      throw makeHttpError(429, `Server room limit reached (${this.maxRooms})`);
    }

    const cleanName = typeof name === "string" ? name.trim() : "";
    if (cleanName.length < 2 || cleanName.length > 60) {
      throw makeHttpError(400, "Room name must be 2..60 characters");
    }

    const slug =
      id ??
      `${cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 24) || "room"}-${crypto.randomUUID().slice(0, 4)}`;

    if (this.rooms.has(slug)) {
      throw makeHttpError(409, `Room "${slug}" already exists`);
    }

    const room = new Room({
      id: slug,
      name: cleanName,
      maxPlayers: Math.min(this.defaultMaxPlayers, Math.max(2, Number(maxPlayers) || this.defaultMaxPlayers)),
      arena,
      persistent,
      onBroadcastSnapshot: this.onBroadcastSnapshot,
    });

    room.on("empty", () => {
      if (!room.persistent) {
        this.deleteRoom(room.id);
      }
    });

    this.rooms.set(room.id, room);
    this.onRoomCreated?.(room);
    return room;
  }

  deleteRoom(id: string): boolean {
    const room = this.rooms.get(id);
    if (!room) return false;
    room.match.stop();
    room.emit("closed");
    this.rooms.delete(id);
    return true;
  }

  closeAll(): void {
    for (const id of Array.from(this.rooms.keys())) {
      this.deleteRoom(id);
    }
  }
}