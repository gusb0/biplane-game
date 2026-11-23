export const PROTOCOL_VERSION = 1;

export const WS_CLOSE = Object.freeze({
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  JOIN_TIMEOUT: 4001,
  ROOM_FULL: 4002,
  ROOM_NOT_FOUND: 4004,
});

export function validateIncomingMessage(rawData, maxPayloadBytes = 16384) {
  const byteLength = Buffer.isBuffer(rawData)
    ? rawData.byteLength
    : Buffer.byteLength(String(rawData), 'utf8');

  if (byteLength > maxPayloadBytes) {
    return {
      ok: false,
      code: WS_CLOSE.MESSAGE_TOO_BIG,
      reason: `Message exceeds maxPayload (${byteLength} > ${maxPayloadBytes})`,
    };
  }

  let msg;
  try {
    const text = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : String(rawData);
    msg = JSON.parse(text);
  } catch {
    return {
      ok: false,
      code: WS_CLOSE.PROTOCOL_ERROR,
      reason: 'Malformed JSON payload',
    };
  }

  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return {
      ok: false,
      code: WS_CLOSE.PROTOCOL_ERROR,
      reason: 'Message must be a JSON object',
    };
  }

  if (msg.v !== undefined && msg.v !== PROTOCOL_VERSION) {
    return {
      ok: false,
      code: WS_CLOSE.PROTOCOL_ERROR,
      reason: `Unsupported protocol version: ${msg.v}`,
    };
  }

  switch (msg.type) {
    case 'join': {
      if (typeof msg.roomId !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(msg.roomId)) {
        return { ok: false, code: WS_CLOSE.PROTOCOL_ERROR, reason: 'Invalid roomId in join' };
      }
      const cleanName = typeof msg.name === 'string' ? msg.name.trim() : '';
      if (cleanName.length < 1 || cleanName.length > 20) {
        return { ok: false, code: WS_CLOSE.PROTOCOL_ERROR, reason: 'Invalid player name (1..20 chars)' };
      }
      return {
        ok: true,
        msg: { v: PROTOCOL_VERSION, type: 'join', roomId: msg.roomId, name: cleanName },
      };
    }

    case 'chat': {
      const cleanText = typeof msg.text === 'string' ? msg.text.trim() : '';
      if (cleanText.length < 1 || cleanText.length > 200) {
        return { ok: false, code: WS_CLOSE.PROTOCOL_ERROR, reason: 'Invalid chat text (1..200 chars)' };
      }
      return {
        ok: true,
        msg: { v: PROTOCOL_VERSION, type: 'chat', text: cleanText },
      };
    }

    case 'leave':
      return { ok: true, msg: { v: PROTOCOL_VERSION, type: 'leave' } };

    case 'ping':
      return { ok: true, msg: { v: PROTOCOL_VERSION, type: 'ping', t: Number(msg.t) || Date.now() } };

    default:
      return {
        ok: false,
        code: WS_CLOSE.PROTOCOL_ERROR,
        reason: `Unknown message type: ${String(msg.type)}`,
      };
  }
}

export function encodePacket(type, payload = {}) {
  return JSON.stringify({
    v: PROTOCOL_VERSION,
    type,
    t: Date.now(),
    ...payload,
  });
}