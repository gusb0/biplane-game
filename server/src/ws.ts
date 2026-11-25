import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import type http from "node:http";
import { decodeInputBinary, encodeSnapshotBinary } from "@biplane/shared";
import type { SnapshotMessage } from "@biplane/shared";
import { decodeAndValidateClientMessage, encodePacket, WS_CLOSE } from "./protocol.js";
import type { Room, RoomManager, RoomPlayer } from "./rooms.js";
import type { ServerConfig } from "./config.js";
import type { NetworkSimulator } from "./netSim.js";

interface ClientSessionState {
  room: Room | null;
  player: RoomPlayer | null;
  codec: "binary" | "json";
  missedPongs: number;
  tokens: number;
  lastRefill: number;
  joinDeadlineTimer: ReturnType<typeof setTimeout> | null;
}

const SESSION_MAP = new WeakMap<WebSocket, ClientSessionState>();

export function setupWebSocketServer(
  httpServer: http.Server,
  {
    roomManager,
    config,
    netSim,
  }: {
    roomManager: RoomManager;
    config: ServerConfig;
    netSim: NetworkSimulator;
  }
) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: config.maxPayloadBytes,
  });

  const socketsByPlayerId = new Map<string, WebSocket>();

  function safeSend(
    socket: WebSocket,
    data: string | ArrayBuffer | Buffer,
    { critical = true, isBinary = false }: { critical?: boolean; isBinary?: boolean } = {}
  ): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;

    if (socket.bufferedAmount > config.slowClientBufferBytes) {
      if (!critical) return false;
      if (socket.bufferedAmount > config.slowClientBufferBytes * 4) {
        socket.close(WS_CLOSE.POLICY_VIOLATION, "Client too slow (backpressure limit)");
        return false;
      }
    }

    netSim.schedule(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data, { binary: isBinary });
      }
    });
    return true;
  }

  function sendSnapshotToPlayer(playerId: string, snapshot: SnapshotMessage): void {
    const socket = socketsByPlayerId.get(playerId);
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const state = SESSION_MAP.get(socket);
    const codec = state?.codec ?? "binary";
    if (codec === "json") {
      safeSend(socket, encodePacket("snapshot_json", { ...snapshot }), {
        critical: false,
        isBinary: false,
      });
    } else {
      const bin = encodeSnapshotBinary(snapshot);
      safeSend(socket, bin, { critical: false, isBinary: true });
    }
  }

  function broadcastRoom(
    room: Room,
    type: string,
    payload: Record<string, unknown>,
    { critical = true, excludePlayerId = null }: { critical?: boolean; excludePlayerId?: string | null } = {}
  ): void {
    const packet = encodePacket(type, payload);
    for (const client of wss.clients) {
      const state = SESSION_MAP.get(client);
      if (!state?.room || state.room.id !== room.id) continue;
      if (excludePlayerId && state.player?.id === excludePlayerId) continue;
      safeSend(client, packet, { critical, isBinary: false });
    }
  }

  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      const state = SESSION_MAP.get(socket);
      if (!state) continue;

      if (state.missedPongs >= 2) {
        socket.terminate();
        continue;
      }

      state.missedPongs += 1;
      socket.ping();
    }
  }, 15_000);

  wss.on("connection", (socket: WebSocket, req: http.IncomingMessage) => {
    const reqUrl = new URL(req.url ?? "/ws", "http://localhost");
    const initialCodec: "binary" | "json" =
      reqUrl.searchParams.get("codec") === "json" ? "json" : "binary";

    const state: ClientSessionState = {
      room: null,
      player: null,
      codec: initialCodec,
      missedPongs: 0,
      tokens: config.rateLimitPerSec * 3,
      lastRefill: Date.now(),
      joinDeadlineTimer: null,
    };
    SESSION_MAP.set(socket, state);

    socket.on("error", (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ws] Socket error:", message);
    });

    socket.on("pong", () => {
      state.missedPongs = 0;
    });

    state.joinDeadlineTimer = setTimeout(() => {
      if (!state.player && socket.readyState === WebSocket.OPEN) {
        socket.close(WS_CLOSE.JOIN_TIMEOUT, "Join handshake timeout (5s)");
      }
    }, 5_000);

    const cleanupMembership = (): void => {
      if (state.joinDeadlineTimer !== null) {
        clearTimeout(state.joinDeadlineTimer);
        state.joinDeadlineTimer = null;
      }
      if (state.room && state.player) {
        const { room, player } = state;
        socketsByPlayerId.delete(player.id);
        state.room = null;
        state.player = null;
        room.leave(player.id);
        broadcastRoom(room, "roster", {
          roomId: room.id,
          players: room.roster,
          left: player,
        });
      }
    };

    const handleInboundFrame = (rawData: RawData, isBinary: boolean): void => {
      const now = Date.now();
      const elapsedSec = (now - state.lastRefill) / 1000;
      const maxBurst = config.rateLimitPerSec * 3;
      state.tokens = Math.min(maxBurst, state.tokens + elapsedSec * maxBurst);
      state.lastRefill = now;

      if (state.tokens < 1) {
        socket.close(WS_CLOSE.POLICY_VIOLATION, "Rate limit exceeded");
        return;
      }
      state.tokens -= 1;

      if (isBinary) {
        if (!state.room || !state.player) return;
        try {
          const buf = Buffer.isBuffer(rawData)
            ? rawData
            : rawData instanceof ArrayBuffer
              ? new Uint8Array(rawData)
              : Buffer.concat(rawData);
          const input = decodeInputBinary(buf);
          state.room.match.enqueueInput(state.player.slot, input);
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : "Invalid binary packet";
          console.warn("[ws] Bad binary input:", reason);
          socket.close(WS_CLOSE.PROTOCOL_ERROR, reason);
        }
        return;
      }

      const parsed = decodeAndValidateClientMessage(rawData, config.maxPayloadBytes);
      if (!parsed.ok) {
        console.warn("[ws] Rejected client message:", parsed.error);
        socket.close(WS_CLOSE.PROTOCOL_ERROR, parsed.error);
        return;
      }

      const msg = parsed.value;
      switch (msg.type) {
        case "ping": {
          safeSend(socket, encodePacket("pong", { clientT: msg.t }), {
            critical: false,
            isBinary: false,
          });
          return;
        }
        case "net_config": {
          if (msg.codec) state.codec = msg.codec;
          netSim.configure({
            delayMs: msg.delayMs,
            jitterMs: msg.jitterMs,
            dropRate: msg.dropRate,
          });
          safeSend(
            socket,
            encodePacket("net_config", { codec: state.codec, ...netSim.toJSON() }),
            { critical: true, isBinary: false }
          );
          return;
        }
        case "join": {
          if (state.player) cleanupMembership();

          const room = roomManager.getRoom(msg.roomId);
          if (!room) {
            socket.close(WS_CLOSE.ROOM_NOT_FOUND, `Room "${msg.roomId}" not found`);
            return;
          }

          const player = room.join(msg.name);
          if (!player) {
            socket.close(WS_CLOSE.ROOM_FULL, `Room "${room.id}" is full`);
            return;
          }

          if (state.joinDeadlineTimer !== null) {
            clearTimeout(state.joinDeadlineTimer);
            state.joinDeadlineTimer = null;
          }
          state.room = room;
          state.player = player;
          socketsByPlayerId.set(player.id, socket);

          safeSend(
            socket,
            encodePacket("joined", {
              room: room.toJSON(),
              player,
              players: room.roster,
              seed: room.match.seed,
              codec: state.codec,
              netSim: netSim.toJSON(),
            }),
            { critical: true, isBinary: false }
          );

          broadcastRoom(
            room,
            "roster",
            {
              roomId: room.id,
              players: room.roster,
              joined: player,
            },
            { critical: true, excludePlayerId: player.id }
          );
          return;
        }
        case "chat": {
          if (!state.room || !state.player) {
            socket.close(WS_CLOSE.PROTOCOL_ERROR, "Must join a room before chatting");
            return;
          }
          const chatMsg = state.room.chat(state.player.id, msg.text);
          if (chatMsg) {
            broadcastRoom(state.room, "chat", { message: chatMsg }, { critical: false });
          }
          return;
        }
        case "input": {
          if (state.room && state.player) {
            state.room.match.enqueueInput(state.player.slot, msg);
          }
          return;
        }
        case "leave": {
          cleanupMembership();
          return;
        }
        default: {
          const _exhaustive: never = msg;
          return _exhaustive;
        }
      }
    };

    socket.on("message", (rawData: RawData, isBinary: boolean) => {
      if (isBinary) {
        const copy = Buffer.isBuffer(rawData)
          ? Buffer.from(rawData)
          : rawData instanceof ArrayBuffer
            ? Buffer.from(rawData)
            : Buffer.concat(rawData);
        netSim.schedule(() => handleInboundFrame(copy, true));
      } else {
        const text = Buffer.isBuffer(rawData) ? rawData.toString("utf8") : String(rawData);
        netSim.schedule(() => handleInboundFrame(text, false));
      }
    });

    socket.on("close", () => {
      cleanupMembership();
    });
  });

  async function closeAllSockets(): Promise<void> {
    clearInterval(heartbeatTimer);
    for (const socket of wss.clients) {
      socket.close(WS_CLOSE.GOING_AWAY, "Server shutting down");
    }
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  }

  return { wss, closeAllSockets, sendSnapshotToPlayer };
}