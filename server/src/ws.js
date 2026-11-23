import { WebSocketServer, WebSocket } from 'ws';
import { validateIncomingMessage, encodePacket, WS_CLOSE } from './protocol.js';

export function setupWebSocketServer(httpServer, { roomManager, config }) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: config.maxPayloadBytes,
  });

  function safeSend(socket, encodedJson, { critical = true } = {}) {
    if (socket.readyState !== WebSocket.OPEN) return false;

    if (socket.bufferedAmount > config.slowClientBufferBytes) {
      if (!critical) return false;
      if (socket.bufferedAmount > config.slowClientBufferBytes * 4) {
        socket.close(WS_CLOSE.POLICY_VIOLATION, 'Client too slow (backpressure limit)');
        return false;
      }
    }

    socket.send(encodedJson);
    return true;
  }

  function broadcastRoom(room, type, payload, { critical = true, excludePlayerId = null } = {}) {
    const packet = encodePacket(type, payload);
    for (const client of wss.clients) {
      const state = client.userData;
      if (!state || state.room?.id !== room.id) continue;
      if (excludePlayerId && state.player?.id === excludePlayerId) continue;
      safeSend(client, packet, { critical });
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

  wss.on('connection', (socket) => {
    const state = {
      room: null,
      player: null,
      missedPongs: 0,
      tokens: config.rateLimitPerSec,
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

    socket.on('message', (rawData) => {
      const now = Date.now();
      const elapsedSec = (now - state.lastRefill) / 1000;
      state.tokens = Math.min(
        config.rateLimitPerSec,
        state.tokens + elapsedSec * config.rateLimitPerSec
      );
      state.lastRefill = now;

      if (state.tokens < 1) {
        socket.close(WS_CLOSE.POLICY_VIOLATION, 'Rate limit exceeded');
        return;
      }
      state.tokens -= 1;

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

        safeSend(
          socket,
          encodePacket('joined', {
            room: room.toJSON(),
            player,
            players: room.roster,
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

  return { wss, closeAllSockets };
}