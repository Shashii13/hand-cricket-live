// One authoritative process owns room state. No client can set scores or time.
export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export class GameService {
  constructor({ now = () => Date.now(), random = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n } = {}) {
    this.rooms = new Map(); this.now = now; this.random = random;
  }
  shuffle(items) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) { const j = this.random(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  name(value) {
    const name = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > 18 || /[\x00-\x1f]/.test(name)) throw new GameError('Use a nickname with 1–18 characters.');
    return name;
  }
  player(name) { return { id: crypto.randomUUID(), token: crypto.randomUUID(), name, seen: this.now(), score: 0, superScore: null, done: false, out: false }; }
  create(name) {
    this.cleanup();
    if (this.rooms.size >= 300) throw new GameError('Too many rooms right now. Try again soon.', 503);
    const p = this.player(this.name(name)); const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code; do { code = Array.from({ length: 6 }, () => alphabet[this.random(alphabet.length)]).join(''); } while (this.rooms.has(code));
    const room = { code, players: [p], host: p.id, phase: 'lobby', mode: 'regular', order: [], roundOrder: [], turn: 0, ball: 0, revision: 0, history: [], reactions: [], winners: [], touched: this.now() };
    this.rooms.set(code, room); return this.response(room, p);
  }
  get(code) {
    const room = this.rooms.get(String(code ?? '').trim().toUpperCase());
    if (!room || this.now() - room.touched > 4 * 3600000) throw new GameError('Room expired or not found. Check the code or create a new room.', 404);
    return room;
  }
  join(code, name, token) {
    const room = this.get(code); this.advance(room);
    const existing = room.players.find(p => p.token === token);
    if (existing) { existing.seen = this.now(); return this.response(room, existing); }
    const clean = this.name(name);
    if (room.players.some(p => p.name.toLowerCase() === clean.toLowerCase())) throw new GameError('That nickname is taken. Try another.');
    if ((room.phase === 'lobby' && room.players.length >= 8) || room.players.length >= 16) throw new GameError('This room is full.');
    const p = this.player(clean); room.players.push(p); return this.response(room, p);
  }
  auth(room, token) {
    const p = room.players.find(p => p.token === token);
    if (!p) throw new GameError('Your seat could not be restored. Join the room again.', 401);
    p.seen = this.now(); room.touched = this.now();
    const host = room.players.find(p => p.id === room.host);
    if (!host || this.now() - host.seen > 20000) room.host = p.id;
    return p;
  }
  act(code, token, action, data = {}) {
    const room = this.get(code); const p = this.auth(room, token); this.advance(room);
    if (action === 'start') {
      if (p.id !== room.host) throw new GameError('Only the host can start the match.', 403);
      if (!['lobby', 'finished'].includes(room.phase)) throw new GameError('The match is already running.');
      const active = room.players.filter(q => this.now() - q.seen < 20000).slice(0, 8);
      if (active.length < 2) throw new GameError('You need at least two connected players.');
      for (const q of room.players) Object.assign(q, { score: 0, superScore: null, done: false, out: false });
      room.order = this.shuffle(active.map(q => q.id)); room.roundOrder = [...room.order];
      Object.assign(room, { mode: 'regular', turn: 0, ball: 0, history: [], winners: [], last: null });
      this.intro(room, this.now());
    } else if (action === 'pick') {
      if (room.phase !== 'picking' || data.ballId !== room.ballId) throw new GameError('That ball has closed. Wait for the next one.');
      if (p.id !== room.batter && p.id !== room.bowler) throw new GameError('Watch this ball. Your turn is coming.', 403);
      if (!Number.isInteger(data.number) || data.number < 1 || data.number > 6) throw new GameError('Pick a number from 1 to 6.');
      if (room.picks[p.id] !== undefined) throw new GameError('Your choice is already locked.');
      room.picks[p.id] = data.number;
      if (room.picks[room.batter] !== undefined && room.picks[room.bowler] !== undefined) this.resolve(room, this.now());
    } else if (action === 'react') {
      if (!['👏', '🔥', '😂', '😮'].includes(data.emoji)) throw new GameError('Unknown reaction.');
      if (p.reacted && this.now() - p.reacted < 1000) throw new GameError('Give it a second.');
      p.reacted = this.now(); room.reactions.push({ id: crypto.randomUUID(), name: p.name, emoji: data.emoji, at: this.now() });
      room.reactions = room.reactions.slice(-12);
    } else if (action === 'leave') {
      p.seen = 0;
      if (room.phase === 'lobby' || room.phase === 'finished' || !room.order.includes(p.id)) room.players = room.players.filter(q => q.id !== p.id);
      if (room.host === p.id) room.host = room.players.find(q => this.now() - q.seen < 20000)?.id;
      return { left: true };
    } else if (action !== 'state') throw new GameError('Unknown action.');
    return this.response(room, p);
  }
  intro(r, at) {
    r.phase = 'intro'; r.deadline = at + 3000; r.ball = 0; r.last = null;
    r.batter = r.roundOrder[r.turn]; r.bowler = this.bowler(r); r.picks = {}; r.ballId = null;
  }
  bowler(r) {
    if (r.mode === 'super') { const eligible = r.order.filter(id => id !== r.batter); return eligible[this.random(eligible.length)]; }
    const index = r.order.indexOf(r.batter); const others = [...r.order.slice(index + 1), ...r.order.slice(0, index)];
    return others[r.ball % others.length];
  }
  openBall(r, at) {
    if (r.ball > 0) r.bowler = this.bowler(r);
    r.ball++; r.phase = 'picking'; r.deadline = at + 6000; r.picks = {}; r.last = null; r.ballId = crypto.randomUUID();
  }
  resolve(r, at) {
    const bat = r.picks[r.batter] ?? null;
    const automatic = r.picks[r.bowler] === undefined;
    const bowl = r.picks[r.bowler] ?? (this.random(6) + 1);
    const out = bat !== null && bat === bowl; const runs = bat === null || out ? 0 : bat;
    const p = r.players.find(q => q.id === r.batter);
    r.last = { ballId: r.ballId, mode: r.mode, batter: r.batter, bowler: r.bowler, ball: r.ball, bat, bowl, out, runs, automatic, before: r.mode === 'regular' ? p.score : 0 };
    // Both choices are committed. Send a future reveal time to every device.
    r.phase = 'reveal'; r.revealAt = at + 650; r.deadline = r.revealAt + 2300; r.applied = false;
  }
  applyResult(r) {
    if (r.applied) return;
    const p = r.players.find(q => q.id === r.batter); const result = r.last;
    if (r.mode === 'regular') { p.score += result.runs; p.out = result.out; p.done = result.out || r.ball === 6; }
    else p.superScore = result.runs;
    r.history.push({ ...result }); r.applied = true;
  }
  advance(r) {
    const now = this.now();
    for (let guard = 0; guard < 240; guard++) {
      if (r.phase === 'reveal' && now >= r.revealAt) this.applyResult(r);
      if (!['intro', 'picking', 'reveal'].includes(r.phase) || now < r.deadline) break;
      const at = r.deadline;
      if (r.phase === 'intro') this.openBall(r, at);
      else if (r.phase === 'picking') this.resolve(r, at);
      else {
        if (r.last.out || r.ball === 6 || r.mode === 'super') {
          r.turn++;
          if (r.turn < r.roundOrder.length) this.intro(r, at);
          else this.finishRound(r, at);
        } else this.openBall(r, at);
      }
    }
  }
  finishRound(r, at) {
    const candidates = r.players.filter(p => r.roundOrder.includes(p.id));
    const key = r.mode === 'regular' ? 'score' : 'superScore';
    const top = Math.max(...candidates.map(p => p[key] ?? 0)); const tied = candidates.filter(p => p[key] === top).map(p => p.id);
    if (r.mode === 'regular' && tied.length > 1) {
      r.mode = 'super'; r.roundOrder = this.shuffle(tied); r.turn = 0; this.intro(r, at);
    } else { r.winners = tied; r.phase = 'finished'; r.deadline = null; }
  }
  response(r, p) {
    this.advance(r); r.touched = this.now();
    const candidates = r.players.filter(q => r.roundOrder.includes(q.id) && q.id !== r.batter);
    const topScore = Math.max(0, ...candidates.map(q => r.mode === 'super' ? q.superScore ?? 0 : q.score));
    return { token: p.token, you: p.id, room: {
      code: r.code, host: r.host, phase: r.phase, mode: r.mode, order: r.order, roundOrder: r.roundOrder, turn: r.turn,
      ball: r.ball, ballId: r.ballId, batter: r.batter, bowler: r.bowler, deadline: r.deadline, revealAt: r.revealAt,
      serverNow: this.now(), topScore, winners: r.winners,
      players: r.players.map(({ id, name, score, superScore, done, out, seen }) => ({ id, name, score, superScore, done, out, connected: this.now() - seen < 10000 })),
      ownPick: r.picks?.[p.id] ?? null,
      ready: { batter: r.picks?.[r.batter] !== undefined, bowler: r.picks?.[r.bowler] !== undefined },
      last: r.phase === 'reveal' ? r.last : null,
      history: r.history.slice(-64), reactions: r.reactions.filter(x => this.now() - x.at < 3000)
    } };
  }
  cleanup() { for (const [code, r] of this.rooms) if (this.now() - r.touched > 4 * 3600000) this.rooms.delete(code); }
}
