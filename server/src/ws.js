import { WebSocketServer, WebSocket } from 'ws';
import { decodeInputBinary, encodeSnapshotBinary } from '@biplane/shared';
import { validateIncomingMessage, encodePacket, WS_CLOSE } from './protocol.js';

export function setupWebSocketServer(httpServer, { roomManager, config, netSim }) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: config.maxPayloadBytes,
  });

  const socketsByPlayerId = new Map();

  function safeSend(socket, data, { critical = true, isBinary = false } = {}) {
    if (socket.readyState !== WebSocket.OPEN) return false;

    if (socket.bufferedAmount > config.slowClientBufferBytes) {
      if (!critical) return false;
      if (socket.bufferedAmount > config.slowClientBufferBytes * 4) {
        socket.close(WS_CLOSE.POLICY_VIOLATION, 'Client too slow (backpressure limit)');
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

  function sendSnapshotToPlayer(playerId, snapshotObj) {
    const socket = socketsByPlayerId.get(playerId);
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const codec = socket.userData?.codec || 'binary';
    if (codec === 'json') {
      safeSend(socket, encodePacket('snapshot_json', snapshotObj), { critical: false, isBinary: false });
    } else {
      const bin = encodeSnapshotBinary(snapshotObj);
      safeSend(socket, bin, { critical: false, isBinary: true });
    }
  }

  function broadcastRoom(room, type, payload, { critical = true, excludePlayerId = null } = {}) {
    const packet = encodePacket(type, payload);
    for (const client of wss.clients) {
      const state = client.userData;
      if (!state || state.room?.id !== room.id) continue;
      if (excludePlayerId && state.player?.id === excludePlayerId) continue;
      safeSend(client, packet, { critical, isBinary: false });
    }
  }

  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      const state = socket.userData;
      if (!state) continue;

      if (state.missedPongs >= 2) {
        socket.terminate();
        continue;
      }

      state.missedPongs += 1;
      socket.ping();
    }
  }, 15_000);

  wss.on('connection', (socket, req) => {
    const reqUrl = new URL(req.url || '/ws', 'http://localhost');
    const initialCodec = reqUrl.searchParams.get('codec') === 'json' ? 'json' : 'binary';
    if (reqUrl.searchParams.has('delay') || reqUrl.searchParams.has('jitter') || reqUrl.searchParams.has('drop')) {
      netSim.configure({
        delayMs: reqUrl.searchParams.get('delay'),
        jitterMs: reqUrl.searchParams.get('jitter'),
        dropRate: reqUrl.searchParams.get('drop'),
      });
    }

    const state = {
      room: null,
      player: null,
      codec: initialCodec,
      missedPongs: 0,
      tokens: config.rateLimitPerSec * 3,
      lastRefill: Date.now(),
      joinDeadlineTimer: null,
    };
    socket.userData = state;

    socket.on('error', (err) => {
      console.error('[ws] Socket error:', err.message);
    });

    socket.on('pong', () => {
      state.missedPongs = 0;
    });

    state.joinDeadlineTimer = setTimeout(() => {
      if (!state.player && socket.readyState === WebSocket.OPEN) {
        socket.close(WS_CLOSE.JOIN_TIMEOUT, 'Join handshake timeout (5s)');
      }
    }, 5_000);

    const cleanupMembership = () => {
      if (state.joinDeadlineTimer) {
        clearTimeout(state.joinDeadlineTimer);
        state.joinDeadlineTimer = null;
      }
      if (state.room && state.player) {
        const { room, player } = state;
        socketsByPlayerId.delete(player.id);
        state.room = null;
        state.player = null;
        room.leave(player.id);
        broadcastRoom(room, 'roster', {
          roomId: room.id,
          players: room.roster,
          left: player,
        });
      }
    };

    const handleInboundFrame = (rawData, isBinary) => {
      const now = Date.now();
      const elapsedSec = (now - state.lastRefill) / 1000;
      const maxBurst = config.rateLimitPerSec * 3;
      state.tokens = Math.min(maxBurst, state.tokens + elapsedSec * maxBurst);
      state.lastRefill = now;

      if (state.tokens < 1) {
        socket.close(WS_CLOSE.POLICY_VIOLATION, 'Rate limit exceeded');
        return;
      }
      state.tokens -= 1;

      // 1. Fast binary path for player inputs (DataView)
      if (isBinary) {
        if (!state.room || !state.player) return;
        try {
          const input = decodeInputBinary(rawData);
          state.room.match.enqueueInput(state.player.slot, input);
        } catch (err) {
          socket.close(WS_CLOSE.PROTOCOL_ERROR, err.message);
        }
        return;
      }

      // 2. JSON control & fallback input path
      let rawObj = null;
      try {
        rawObj = JSON.parse(Buffer.isBuffer(rawData) ? rawData.toString('utf8') : String(rawData));
      } catch {
        socket.close(WS_CLOSE.PROTOCOL_ERROR, 'Malformed JSON');
        return;
      }

      if (rawObj?.type === 'input') {
        if (state.room && state.player) {
          state.room.match.enqueueInput(state.player.slot, rawObj);
        }
        return;
      }

      if (rawObj?.type === 'net_config') {
        if (rawObj.codec === 'json' || rawObj.codec === 'binary') {
          state.codec = rawObj.codec;
        }
        netSim.configure({
          delayMs: rawObj.delayMs,
          jitterMs: rawObj.jitterMs,
          dropRate: rawObj.dropRate,
        });
        safeSend(
          socket,
          encodePacket('net_config', { codec: state.codec, ...netSim.toJSON() }),
          { critical: true }
        );
        return;
      }

      const parsed = validateIncomingMessage(rawData, config.maxPayloadBytes);
      if (!parsed.ok) {
        socket.close(parsed.code, parsed.reason);
        return;
      }

      const { msg } = parsed;

      if (msg.type === 'ping') {
        safeSend(socket, encodePacket('pong', { clientT: msg.t }), { critical: false });
        return;
      }

      if (msg.type === 'join') {
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

        clearTimeout(state.joinDeadlineTimer);
        state.joinDeadlineTimer = null;
        state.room = room;
        state.player = player;
        socketsByPlayerId.set(player.id, socket);

        safeSend(
          socket,
          encodePacket('joined', {
            room: room.toJSON(),
            player,
            players: room.roster,
            seed: room.match.seed,
            codec: state.codec,
            netSim: netSim.toJSON(),
          }),
          { critical: true }
        );

        broadcastRoom(
          room,
          'roster',
          {
            roomId: room.id,
            players: room.roster,
            joined: player,
          },
          { critical: true, excludePlayerId: player.id }
        );
        return;
      }

      if (!state.room || !state.player) {
        socket.close(WS_CLOSE.PROTOCOL_ERROR, 'Must join a room before sending messages');
        return;
      }

      if (msg.type === 'chat') {
        const chatMsg = state.room.chat(state.player.id, msg.text);
        if (chatMsg) {
          broadcastRoom(state.room, 'chat', { message: chatMsg }, { critical: false });
        }
        return;
      }

      if (msg.type === 'leave') {
        cleanupMembership();
      }
    };

    socket.on('message', (rawData, isBinary) => {
      if (isBinary) {
        // Copy Buffer before async setTimeout so ws doesn't reuse underlying slab
        const copy = Buffer.from(rawData);
        netSim.schedule(() => handleInboundFrame(copy, true));
      } else {
        const text = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : String(rawData);
        netSim.schedule(() => handleInboundFrame(text, false));
      }
    });

    socket.on('close', () => {
      cleanupMembership();
    });
  });

  async function closeAllSockets() {
    clearInterval(heartbeatTimer);
    for (const socket of wss.clients) {
      socket.close(WS_CLOSE.GOING_AWAY, 'Server shutting down');
    }
    await new Promise((resolve) => wss.close(resolve));
  }

  return { wss, closeAllSockets, sendSnapshotToPlayer };
}