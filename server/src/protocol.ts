import { parseClientMessage, PROTOCOL_VERSION } from "@biplane/shared";
import type { ClientMessage, ParseResult } from "@biplane/shared";

export { PROTOCOL_VERSION };

export const WS_CLOSE = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  JOIN_TIMEOUT: 4001,
  ROOM_FULL: 4002,
  ROOM_NOT_FOUND: 4004,
} as const;

export function decodeAndValidateClientMessage(
  rawData: unknown,
  maxPayloadBytes = 16384
): ParseResult<ClientMessage> {
  const byteLength = Buffer.isBuffer(rawData)
    ? rawData.byteLength
    : Buffer.byteLength(String(rawData), "utf8");

  if (byteLength > maxPayloadBytes) {
    return {
      ok: false,
      error: `Message exceeds maxPayload (${byteLength} > ${maxPayloadBytes})`,
    };
  }

  let parsedJson: unknown;
  try {
    const text = Buffer.isBuffer(rawData) ? rawData.toString("utf8") : String(rawData);
    parsedJson = JSON.parse(text);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Malformed JSON";
    return { ok: false, error: msg };
  }

  return parseClientMessage(parsedJson);
}

export function encodePacket(type: string, payload: Record<string, unknown> = {}): string {
  return JSON.stringify({
    v: PROTOCOL_VERSION,
    type,
    t: Date.now(),
    ...payload,
  });
}