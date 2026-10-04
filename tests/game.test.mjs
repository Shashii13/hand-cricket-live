import test from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../lib/game.mjs';

function setup(count = 2) {
  let time = 1000000, seed = 42;
  const service = new GameService({ now: () => time, random: n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; } });
  const host = service.create('P1'), code = host.room.code;
  const seats = [host]; for (let i = 1; i < count; i++) seats.push(service.join(code, `P${i + 1}`));
  const room = service.get(code);
  const act = (id, action, data = {}) => service.act(code, seats.find(s => s.you === id).token, action, data);
  const jump = t => { time = t; service.advance(room); };
  const next = () => jump(room.deadline);
  const start = () => { act(host.you, 'start'); next(); };
  const ball = (bat, bowl) => {
    if (room.phase === 'intro') next();
    act(room.batter, 'pick', { ballId: room.ballId, number: bat });
    act(room.bowler, 'pick', { ballId: room.ballId, number: bowl });
    jump(room.revealAt); next();
  };
  return { service, host, seats, code, room, act, jump, next, start, ball };
}

test('private picks, immutable choice, reveal scheduling, and refresh recovery', () => {
  const f = setup(3); f.start();
  const id = f.room.ballId;
  f.act(f.room.batter, 'pick', { ballId: id, number: 6 });
  const bowl = f.act(f.room.bowler, 'state');
  assert.equal(bowl.room.last, null); assert.equal(bowl.room.ownPick, null);
  assert.ok(!JSON.stringify(bowl.room).includes('"picks"'));
  assert.equal(bowl.room.players.some(p => 'token' in p), false);
  const batter = f.seats.find(s => s.you === f.room.batter);
  const restored = f.service.join(f.code, 'ignored', batter.token);
  assert.equal(restored.you, batter.you); assert.equal(restored.room.ownPick, 6);
  assert.equal(restored.room.deadline, f.room.deadline);
  assert.throws(() => f.act(f.room.batter, 'pick', { ballId: id, number: 4 }), /already locked/);
  const spectator = f.seats.find(s => s.you !== f.room.batter && s.you !== f.room.bowler);
  assert.throws(() => f.act(spectator.you, 'pick', { ballId: id, number: 3 }), /Watch this ball/);
  f.act(f.room.bowler, 'pick', { ballId: id, number: 1 });
  const views = f.seats.map(s => f.act(s.you, 'state').room);
  assert.ok(views.every(v => v.revealAt === views[0].revealAt && v.last.bat === 6));
  assert.equal(f.room.players.find(p => p.id === f.room.batter).score, 0);
  f.jump(f.room.revealAt);
  assert.equal(f.room.players.find(p => p.id === f.room.batter).score, 6);
  f.next(); assert.throws(() => f.act(f.room.batter, 'pick', { ballId: id, number: 2 }), /closed/);
});

test('eight players each bat six balls, rotating through six different bowlers', () => {
  const f = setup(8); f.start(); const seen = new Map();
  while (f.room.mode === 'regular') {
    if (f.room.phase === 'intro') f.next();
    const batter = f.room.batter;
    if (!seen.has(batter)) seen.set(batter, []);
    seen.get(batter).push(f.room.bowler);
    f.ball(6, 1);
  }
  assert.equal(seen.size, 8);
  for (const bowlers of seen.values()) { assert.equal(bowlers.length, 6); assert.equal(new Set(bowlers).size, 6); }
  assert.ok(f.room.players.every(p => p.score === 36 && p.done && !p.out));
  assert.equal(f.room.mode, 'super'); assert.equal(f.room.roundOrder.length, 8);
  const winner = f.room.roundOrder[0];
  while (f.room.phase !== 'finished') {
    if (f.room.phase === 'intro') f.next();
    assert.notEqual(f.room.batter, f.room.bowler);
    f.ball(f.room.batter === winner ? 6 : 2, 1);
  }
  assert.deepEqual(f.room.winners, [winner]);
  assert.equal(f.room.history.filter(b => b.mode === 'super').length, 8);
  assert.ok(f.room.players.every(p => p.score === 36));
});

test('first-ball wickets, all-zero ties and exactly one Super Over with shared winners', () => {
  const f = setup(2); f.start();
  f.ball(3, 3); f.ball(2, 2);
  assert.equal(f.room.mode, 'super');
  f.ball(4, 4); f.ball(6, 6);
  assert.equal(f.room.phase, 'finished'); assert.equal(f.room.winners.length, 2);
  assert.equal(f.room.history.length, 4);
  assert.ok(f.room.players.every(p => p.score === 0 && p.superScore === 0));
});

test('timeouts consume a ball, supply a random bowler pick, and reject late picks', () => {
  const f = setup(); f.start(); const id = f.room.ballId;
  f.next(); assert.equal(f.room.last.bat, null); assert.equal(f.room.last.runs, 0); assert.equal(f.room.last.out, false);
  assert.ok(f.room.last.bowl >= 1 && f.room.last.bowl <= 6); assert.equal(f.room.last.automatic, true);
  assert.throws(() => f.act(f.room.batter, 'pick', { ballId: id, number: 5 }), /closed/);
  f.next(); assert.equal(f.room.ball, 2); assert.equal(f.room.phase, 'picking');
});

test('best opposing score is the target and a unique regular winner skips Super Over', () => {
  const f = setup(); f.start(); const first = f.room.batter;
  f.ball(5, 1); f.ball(1, 1);
  const view = f.act(f.room.batter, 'state').room;
  assert.equal(view.topScore, 5);
  f.ball(2, 2);
  assert.equal(f.room.phase, 'finished'); assert.equal(f.room.mode, 'regular'); assert.deepEqual(f.room.winners, [first]);
});

test('room capacity, host authorization, mid-match spectators, and rematch', () => {
  const f = setup(8);
  assert.throws(() => f.service.join(f.code, 'P9'), /full/);
  assert.throws(() => f.act(f.seats[1].you, 'start'), /Only the host/);
  f.start(); const late = f.service.join(f.code, 'P9');
  assert.equal(late.room.order.includes(late.you), false);
  assert.throws(() => f.service.act(f.code, 'forged-token', 'state'), /restored/);
  while (f.room.phase !== 'finished') f.ball(1, 1);
  // Bring every original player online again before restarting.
  for (const s of f.seats) f.service.act(f.code, s.token, 'state');
  const host = f.room.host; f.act(host, 'start');
  assert.equal(f.room.phase, 'intro'); assert.equal(f.room.history.length, 0);
  assert.ok(f.room.players.every(p => p.score === 0 && p.superScore === null));
  assert.equal(f.room.order.length, 8);
});

test('refresh does not reset deadlines; a disconnected room still completes', () => {
  const f = setup(); f.start(); const deadline = f.room.deadline;
  f.jump(deadline - 1000); f.act(f.host.you, 'state'); assert.equal(f.room.deadline, deadline);
  f.jump(deadline + 15 * 60000);
  assert.equal(f.room.phase, 'finished'); assert.equal(f.room.winners.length, 2);
});
