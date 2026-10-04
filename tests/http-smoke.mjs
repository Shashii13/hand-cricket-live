import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const server = !process.env.TEST_URL ? spawn(process.execPath, ['local-server.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: '3000' }, stdio: ['ignore', 'pipe', 'inherit'] }) : null;
if (server) {
  await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Server exited: ${code}`))); });
  process.on('exit', () => server.kill());
}
try {
const base = process.env.TEST_URL || 'http://localhost:3000';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(body) {
  const response = await fetch(`${base}/api/game`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
}
const home = await fetch(base); const html = await home.text();
assert.equal(home.status, 200); assert.match(html, /Hand Cricket Live/);
for (const path of ['/game.css', '/favicon.svg', html.match(/src="([^"]+\.js)"/)[1]]) assert.equal((await fetch(base + path)).status, 200);
const a = await api({ action: 'create', name: 'Asha' }); const code = a.room.code;
const b = await api({ action: 'join', code, name: 'Kabir' });
const c = await api({ action: 'join', code, name: 'Meera' });
const seats = [a, b, c];
const action = (s, action, extra = {}) => api({ code, token: s.token, action, ...extra });
let state = (await action(a, 'start')).room;
await delay(Math.max(0, state.deadline - Date.now()) + 80);
state = (await action(a, 'state')).room; assert.equal(state.phase, 'picking');
const batter = seats.find(s => s.you === state.batter); const bowler = seats.find(s => s.you === state.bowler);
const spectator = seats.find(s => s.you !== state.batter && s.you !== state.bowler);
await action(batter, 'pick', { ballId: state.ballId, number: 6 });
const hidden = (await action(spectator, 'state')).room;
assert.equal(hidden.last, null); assert.equal(hidden.ownPick, null);
const restored = await api({ action: 'join', code, name: 'unused', token: batter.token });
assert.equal(restored.you, batter.you); assert.equal(restored.room.ownPick, 6); assert.equal(restored.room.deadline, state.deadline);
const locked = (await action(bowler, 'pick', { ballId: state.ballId, number: 1 })).room;
const views = await Promise.all(seats.map(s => action(s, 'state')));
assert.ok(views.every(v => v.room.revealAt === locked.revealAt));
await delay(Math.max(0, locked.revealAt - Date.now()) + 80);
const scores = await Promise.all(seats.map(s => action(s, 'state')));
assert.ok(scores.every(v => v.room.players.find(p => p.id === batter.you).score === 6));
console.log('HTTP smoke passed: page/assets, three independent players, hidden picks, rejoin, shared reveal time, synchronized scores.');

} finally { server?.kill(); }
