import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { AuthoritativeMatch } from './match.js';

export class Room extends EventEmitter {
  constructor({ id, name, maxPlayers = 6, arena = {}, persistent = false, onBroadcastSnapshot }) {
    super();
    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.persistent = persistent;
    this.createdAt = Date.now();
    this.players = new Map();
    this.arena = {
      name: arena.name || name,
      width: Number(arena.width) || 960,
      height: Number(arena.height) || 640,
      asteroidCount: Number(arena.asteroidCount) || 6,
      bgColor: arena.bgColor || '#0f172a',
      gridColor: arena.gridColor || 'rgba(56, 189, 248, 0.08)',
    };

    this.match = new AuthoritativeMatch({
      room: this,
      onBroadcastSnapshot,
    });
  }

  get roster() {
    return Array.from(this.players.values());
  }

  #recordEvent(type, detail) {
    const evt = { t: Date.now(), roomId: this.id, type, ...detail };
    this.emit('event', evt);
    return evt;
  }

  join(playerName) {
    if (this.players.size >= this.maxPlayers) return null;

    const player = {
      id: crypto.randomUUID().slice(0, 8),
      name: playerName,
      slot: 0,
      joinedAt: Date.now(),
    };

    player.slot = this.match.addPlayer(player);
    this.players.set(player.id, player);
    this.#recordEvent('join', {
      playerId: player.id,
      slot: player.slot,
      name: player.name,
      count: this.players.size,
    });
    this.emit('join', player);
    return player;
  }

  leave(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;

    this.players.delete(playerId);
    this.match.removePlayerById(playerId);
    this.#recordEvent('leave', { playerId: player.id, name: player.name, count: this.players.size });
    this.emit('leave', player);

    if (this.players.size === 0) {
      this.#recordEvent('empty', {});
      this.emit('empty');
    }
    return player;
  }

  chat(playerId, text) {
    const player = this.players.get(playerId);
    if (!player) return null;

    const message = {
      id: crypto.randomUUID().slice(0, 8),
      playerId: player.id,
      name: player.name,
      text,
      t: Date.now(),
    };

    this.#recordEvent('chat', { playerId: player.id, name: player.name, text });
    this.emit('chat', message);
    return message;
  }

  toJSON() {
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
  constructor({ maxRooms = 20, defaultMaxPlayers = 6, onRoomCreated, onBroadcastSnapshot } = {}) {
    super();
    this.maxRooms = maxRooms;
    this.defaultMaxPlayers = defaultMaxPlayers;
    this.onRoomCreated = onRoomCreated;
    this.onBroadcastSnapshot = onBroadcastSnapshot;
    this.rooms = new Map();

    this.createRoom({
      id: 'sky-patrol',
      name: 'Sky Patrol (Стандартна арена 30 Hz)',
      maxPlayers: defaultMaxPlayers,
      persistent: true,
      arena: {
        name: 'Sky Patrol',
        width: 960,
        height: 640,
        asteroidCount: 6,
        bgColor: '#0f172a',
        gridColor: 'rgba(56, 189, 248, 0.08)',
      },
    });

    this.createRoom({
      id: 'red-baron-canyon',
      name: 'Red Baron Canyon (Щільний пояс астероїдів)',
      maxPlayers: defaultMaxPlayers,
      persistent: true,
      arena: {
        name: 'Red Baron Canyon',
        width: 960,
        height: 640,
        asteroidCount: 9,
        bgColor: '#1c1917',
        gridColor: 'rgba(251, 146, 60, 0.09)',
      },
    });
  }

  get size() {
    return this.rooms.size;
  }

  getRoom(id) {
    return this.rooms.get(id) || null;
  }

  listRooms() {
    return Array.from(this.rooms.values()).map((r) => r.toJSON());
  }

  getMatchStats() {
    return Array.from(this.rooms.values()).map((r) => ({
      roomId: r.id,
      players: r.players.size,
      running: r.match.running,
      ...r.match.stats,
    }));
  }

  createRoom({ id, name, maxPlayers, arena, persistent = false }) {
    if (this.rooms.size >= this.maxRooms) {
      const err = new Error(`Server room limit reached (${this.maxRooms})`);
      err.status = 429;
      throw err;
    }

    const cleanName = String(name || '').trim();
    if (cleanName.length < 2 || cleanName.length > 60) {
      const err = new Error('Room name must be 2..60 characters');
      err.status = 400;
      throw err;
    }

    const slug =
      id ||
      `${cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || 'room'}-${crypto.randomUUID().slice(0, 4)}`;

    if (this.rooms.has(slug)) {
      const err = new Error(`Room "${slug}" already exists`);
      err.status = 409;
      throw err;
    }

    const room = new Room({
      id: slug,
      name: cleanName,
      maxPlayers: Math.min(this.defaultMaxPlayers, Math.max(2, Number(maxPlayers) || this.defaultMaxPlayers)),
      arena,
      persistent,
      onBroadcastSnapshot: this.onBroadcastSnapshot,
    });

    room.on('empty', () => {
      if (!room.persistent) {
        this.deleteRoom(room.id);
      }
    });

    this.rooms.set(room.id, room);
    this.onRoomCreated?.(room);
    return room;
  }

  deleteRoom(id) {
    const room = this.rooms.get(id);
    if (!room) return false;
    room.match.stop();
    room.emit('closed');
    this.rooms.delete(id);
    return true;
  }

  closeAll() {
    for (const id of Array.from(this.rooms.keys())) {
      this.deleteRoom(id);
    }
  }
}