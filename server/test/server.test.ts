import test from "node:test";
import assert from "node:assert/strict";
import { decodeAndValidateClientMessage, WS_CLOSE } from "../src/protocol.js";
import { Room } from "../src/rooms.js";

test("Zod protocol validates join/chat and rejects invalid JSON/oversize", () => {
  const goodJoin = decodeAndValidateClientMessage(
    JSON.stringify({ v: 1, type: "join", roomId: "sky-patrol", name: "Valeriia" })
  );
  assert.equal(goodJoin.ok, true);

  const badJson = decodeAndValidateClientMessage("{not-valid-json");
  assert.equal(badJson.ok, false);

  const tooBig = decodeAndValidateClientMessage("x".repeat(20000), 16384);
  assert.equal(tooBig.ok, false);
  assert.ok(WS_CLOSE.MESSAGE_TOO_BIG === 1009);
});

test("Room emits join, leave, and empty when last player leaves", () => {
  const room = new Room({ id: "ts-room", name: "TS Room", maxPlayers: 4 });
  let emptied = false;
  room.once("empty", () => {
    emptied = true;
  });

  const p1 = room.join("Pilot1");
  assert.ok(p1);
  assert.equal(room.players.size, 1);

  room.leave(p1.id);
  assert.equal(room.players.size, 0);
  assert.equal(emptied, true);
});