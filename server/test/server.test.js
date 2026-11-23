import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIncomingMessage, WS_CLOSE } from '../src/protocol.js';
import { Room } from '../src/rooms.js';

test('protocol validates valid join and chat packets', () => {
  const joinRes = validateIncomingMessage(
    JSON.stringify({ v: 1, type: 'join', roomId: 'sky-patrol', name: 'Valeriia' })
  );
  assert.equal(joinRes.ok, true);
  assert.equal(joinRes.msg.name, 'Valeriia');

  const chatRes = validateIncomingMessage(
    JSON.stringify({ v: 1, type: 'chat', text: 'Привіт!' })
  );
  assert.equal(chatRes.ok, true);
});

test('protocol rejects oversize and unknown messages with close codes', () => {
  const big = validateIncomingMessage('x'.repeat(20000), 16384);
  assert.equal(big.ok, false);
  assert.equal(big.code, WS_CLOSE.MESSAGE_TOO_BIG);

  const unknown = validateIncomingMessage(JSON.stringify({ type: 'hack' }));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, WS_CLOSE.PROTOCOL_ERROR);
});

test('Room emits join, leave, and empty when last player leaves', () => {
  const room = new Room({ id: 'test-room', name: 'Test Room', maxPlayers: 4 });
  let emptied = false;
  room.once('empty', () => {
    emptied = true;
  });

  const p1 = room.join('Pilot1');
  assert.equal(room.players.size, 1);

  room.leave(p1.id);
  assert.equal(room.players.size, 0);
  assert.equal(emptied, true);
});