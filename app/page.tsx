'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Users, Trophy, Radio, Check, LogOut, Zap } from 'lucide-react';
import { FlipNumber, CrowdMoment } from './match-effects';

type Player = { id: string; name: string; score: number; superScore: number | null; done: boolean; out: boolean; connected: boolean };
type Ball = { ballId: string; mode: string; batter: string; bowler: string; ball: number; bat: number | null; bowl: number; runs: number; out: boolean; automatic: boolean; before: number };
type Room = { code: string; host: string; phase: string; mode: string; order: string[]; roundOrder: string[]; turn: number; ball: number; ballId: string; batter: string; bowler: string; deadline: number; revealAt: number; serverNow: number; topScore: number; winners: string[]; players: Player[]; ownPick: number | null; ready: { batter: boolean; bowler: boolean }; last: Ball | null; history: Ball[]; reactions: { id: string; name: string; emoji: string }[] };
type Seat = { code: string; token: string; you: string };
const RULES = ['Pick 1–6 in secret when you’re batting or bowling.', 'Match = OUT. Different = the batter scores their number.', 'Everyone bats once, up to 6 balls. Highest score wins!'];

export default function Home() {
  const [name, setName] = useState(''); const [code, setCode] = useState('');
  const [seat, setSeat] = useState<Seat | null>(null); const seatRef = useRef<Seat | null>(null);
  const [room, setRoom] = useState<Room | null>(null); const roomRef = useRef<Room | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true); const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(Date.now()); const offset = useRef(0);
  const [pick, setPick] = useState<{ ballId: string; number: number } | null>(null);
  const [copied, setCopied] = useState(false); const [notice, setNotice] = useState('');

  const accept = useCallback((data: { room: Room; token: string; you: string }, started: number) => {
    if (!data.room || (roomRef.current?.code === data.room.code && roomRef.current.serverNow > data.room.serverNow)) return;
    offset.current = data.room.serverNow - (started + Date.now()) / 2;
    roomRef.current = data.room; setRoom(data.room); setOnline(true);
  }, []);

  const request = useCallback(async (body: Record<string, unknown>) => {
    const started = Date.now();
    const response = await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    const data = await response.json() as { room: Room; token: string; you: string; error?: string };
    if (!response.ok) throw Object.assign(new Error(data.error || 'Could not connect.'), { status: response.status });
    return { data, started };
  }, []);

  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
    try {
      setName(localStorage.getItem('hcl-name') || '');
      const last = wanted || localStorage.getItem('hcl-last') || ''; setCode(last);
      const saved = localStorage.getItem(`hcl-seat-${last}`);
      if (saved) { const s = JSON.parse(saved); seatRef.current = s; setSeat(s); }
    } catch { /* Private browsers may disable storage; joining still works. */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!seat) return;
    let stop = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const { data, started } = await request({ action: 'state', ...seat });
        if (!stop) { accept(data, started); setError(current => current.startsWith('Room expired') || current.startsWith('Your seat') ? '' : current); }
      } catch (e) {
        if (!stop) {
          setOnline(false);
          const err = e as Error & { status?: number };
          if (err.status === 404 || err.status === 401) {
            setError(err.message); seatRef.current = null; setSeat(null); roomRef.current = null; setRoom(null);
            try { localStorage.removeItem(`hcl-seat-${seat.code}`); localStorage.removeItem('hcl-last'); } catch {}
            return;
          }
        }
      }
      if (!stop) timer = setTimeout(poll, ['lobby', 'finished'].includes(roomRef.current?.phase || '') ? 650 : 180);
    };
    void poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [seat, request, accept]);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now() + offset.current), 50); return () => clearInterval(timer); }, []);

  const enter = async (action: 'create' | 'join') => {
    setBusy(true); setError('');
    try {
      let token; try { token = JSON.parse(localStorage.getItem(`hcl-seat-${code.toUpperCase()}`) || 'null')?.token; } catch {}
      const { data, started } = await request({ action, name, code, token });
      const s = { code: data.room.code, token: data.token, you: data.you }; seatRef.current = s; setSeat(s); accept(data, started);
      try { localStorage.setItem(`hcl-seat-${s.code}`, JSON.stringify(s)); localStorage.setItem('hcl-last', s.code); localStorage.setItem('hcl-name', name.trim()); } catch { setNotice('Keep this tab open: this browser has disabled seat recovery.'); }
      history.replaceState(null, '', `?room=${s.code}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!seatRef.current) return;
    const { data, started } = await request({ action, ...seatRef.current, ...extra }); accept(data, started); return data;
  }, [request, accept]);

  const choose = async (number: number) => {
    if (!room || busy) return;
    const chosen = { ballId: room.ballId, number }; setPick(chosen); setBusy(true); setError('');
    try { await act('pick', chosen); } catch (e) { setPick(null); setError((e as Error).message); } finally { setBusy(false); }
  };
  const start = async () => { setBusy(true); setError(''); try { await act('start'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const leave = async () => {
    try { await act('leave'); } catch {}
    try { localStorage.removeItem('hcl-last'); } catch {}
    seatRef.current = null; setSeat(null); roomRef.current = null; setRoom(null); setError(''); setPick(null); history.replaceState(null, '', '/');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/?room=${room?.code}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setNotice(`Room code: ${room?.code}. Share this page’s address with your friends.`); }
  };

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try { context.registerTool({ name: 'read_cricket_room', description: 'Read the current room and your visible game state. Never reveals an opponent’s uncommitted choice.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => roomRef.current }, { signal: lifecycle.signal }); } catch {}
    return () => lifecycle.abort();
  }, []);

  const me = seat?.you; const isHost = room?.host === me;
  const player = (id?: string) => room?.players.find(p => p.id === id);
  const batter = player(room?.batter); const bowler = player(room?.bowler);
  const spectator = room && !room.order.includes(me || '');
  const role = room?.batter === me ? 'batting' : room?.bowler === me ? 'bowling' : 'watching';
  const revealed = room?.phase === 'reveal' && now >= room.revealAt;
  const selected = room?.ownPick ?? (pick?.ballId === room?.ballId ? pick?.number : null);
  const seconds = Math.max(0, Math.ceil(((room?.deadline || now) - now) / 1000));
  const canPick = online && room?.phase === 'picking' && role !== 'watching' && selected == null && seconds > 0 && !busy;
  const superOver = room?.mode === 'super';
  const score = batter ? (superOver ? batter.superScore ?? 0 : batter.score) : 0;
  const shownScore = revealed && room?.last ? Math.max(score, room.last.before + room.last.runs) : score;
  const inningsHistory = room?.history.filter(b => b.batter === room.batter && b.mode === room.mode) || [];
  const rows = room ? [...room.players].sort((a, b) => b.score - a.score || room.order.indexOf(a.id) - room.order.indexOf(b.id)) : [];
  const activeCount = room?.players.filter(p => p.connected).length || 0;

  const playing = room && !['lobby', 'finished'].includes(room.phase);
  // These offsets only sequence the visual effects inside the existing reveal window.
  const revealElapsed = revealed && room ? now - room.revealAt : 0;
  const momentReady = revealed && revealElapsed >= 420;
  const bigMoment = room?.last?.out ? 'OUT!' : room?.last?.runs === 4 ? 'FOUR!' : room?.last?.runs === 6 ? 'SIX!' : null;

  return <main className={`app-shell ${playing ? 'is-playing' : ''}`}>
    <div className="stadium-backdrop" aria-hidden="true" />
    <header className="topbar"><a className="brand" href="/" aria-label="Hand Cricket Live home"><span className="brand-mark">6</span><span>HAND CRICKET <b>LIVE</b></span></a><span className="edition">2–8 PLAYERS <span>•</span> ONE ROOM</span>{room && <button className="icon-button" onClick={leave} title="Leave room" aria-label="Leave room"><LogOut size={20} /></button>}</header>
    {error && <div className="alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}
    {!hydrated ? <div className="loading">Warming up…</div> : !room && seat ? <div className="loading"><Radio /> Rejoining your room…<button className="secondary" onClick={leave}>Back to start</button></div> : !room ? <div className="entry-layout">
      <section className="intro-copy"><span className="eyebrow">UNDER THE LIGHTS. WITH YOUR GANG.</span><h1>One number.<br />{' '}Six seconds.<br /><em>Howzat!</em></h1><p>Your friends. Your phones.<br />A little mind game. A lot of cricket.</p><div className="rules">{RULES.map((text, i) => <div key={text}><span>0{i + 1}</span><p>{text}</p></div>)}</div><p className="small-note">Top-score tie? One ball each in a Super Over.</p></section>
      <section className="join-card"><div className="card-heading"><Users size={24} /><span>GET THE GANG TOGETHER</span></div><h2>Meet at the crease.</h2><form onSubmit={e => { e.preventDefault(); void enter(code.length ? 'join' : 'create'); }}><label htmlFor="nickname">Your nickname</label><input id="nickname" value={name} onChange={e => setName(e.target.value)} maxLength={18} placeholder="What do your friends call you?" autoComplete="nickname" required /><button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => enter('create')}>{busy ? 'One moment…' : 'Create a room'}</button><div className="divider"><span />OR JOIN YOUR FRIENDS<span /></div><label htmlFor="roomcode">Room code</label><div className="join-line"><input id="roomcode" className="code-input" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={6} placeholder="ABC123" autoCapitalize="characters" autoCorrect="off" spellCheck={false} /><button className="secondary" type="submit" disabled={busy || code.length !== 6 || !name.trim()}>Join room</button></div></form><div className="footnote"><Check size={16} /> No login. No download. Just play.</div></section>
    </div> : <>
      <section className="room-bar"><div><span className="eyebrow">ROOM CODE</span><button className="room-code" onClick={copy} title="Copy invite link">{room.code}{copied ? <Check size={18} /> : <Copy size={18} />}</button></div><div className="connection"><span className={online ? 'signal' : 'signal offline'} />{online ? `${room.players.length} in room` : 'Reconnecting…'}</div></section>
      {!online && <div className="alert">Connection interrupted. Trying to reconnect; the match timer keeps running.</div>}
      <div className="game-layout"><section className="main-game">
        {room.phase === 'lobby' ? <div className="lobby panel"><span className="eyebrow">THE DRESSING ROOM</span><h1>Who’s in?</h1><p>Share the room code or copy the invite link.<br />Everyone joins from their own device.</p><div className="roster">{room.players.map((p, i) => <div className="roster-player" key={p.id}><span className={`avatar color-${i % 4}`}>{p.name.slice(0, 1).toUpperCase()}</span><span>{p.name}{p.id === me && <small>YOU</small>}</span><span className="player-state">{p.id === room.host ? 'HOST' : p.connected ? 'READY' : 'AWAY'}</span></div>)}{room.players.length < 8 && <div className="empty-seat"><Users size={18} />{8 - room.players.length} open spots</div>}</div>{isHost ? <button className="primary" disabled={activeCount < 2 || busy} onClick={start}>{activeCount < 2 ? 'Waiting for one more player…' : `Start match · ${Math.min(activeCount, 8)} players`}</button> : <p className="waiting">Waiting for {player(room.host)?.name || 'the host'} to start…</p>}<div className="match-settings"><span>6 balls per innings</span><span>6-second picks</span><span>Rotating bowlers</span></div></div>
        : room.phase === 'finished' ? <div className="result panel"><Trophy className="trophy" size={56} /><span className="eyebrow">{room.winners.length > 1 ? 'SHARED VICTORY' : 'WHAT A MATCH'}</span><h1>{room.winners.map(id => player(id)?.name).join(' & ')}</h1><h2>{room.winners.length > 1 ? 'Share the win!' : 'Takes the win!'}</h2><p>{superOver ? 'Decided by the one-ball Super Over.' : `${player(room.winners[0])?.score} runs. Bragging rights secured.`}</p><div className="final-scores">{rows.filter(p => room.order.includes(p.id)).map((p, i) => <div className={room.winners.includes(p.id) ? 'winner' : ''} key={p.id}><span>{room.winners.includes(p.id) ? '★' : i + 1}</span><strong>{p.name}</strong><span>{p.score} runs{p.superScore !== null && <small>Super Over: {p.superScore}</small>}</span></div>)}</div>{isHost ? <button className="primary" disabled={busy || activeCount < 2} onClick={start}>Play again · reshuffle the order</button> : <p className="waiting">Waiting for the host to start a rematch.</p>}</div>
        : <div className={`match panel ${role !== 'watching' ? 'has-controls' : 'watch-mode'}`}><div className="innings-meta"><span className="eyebrow">{superOver ? '⚡ SUPER OVER' : `INNINGS ${room.turn + 1} OF ${room.roundOrder.length}`}</span><span className="ball-count">BALL {Math.max(1, room.ball)} / {superOver ? 1 : 6}</span></div>
          <div className="scoreboard"><div><span className="eyebrow">{batter?.name}’S SCORE</span><strong className="big-score">{shownScore}<small>RUNS</small></strong></div><div className="target"><span>CURRENT TOP SCORE</span><strong>{room.topScore}</strong><p>{shownScore > room.topScore ? 'In the lead!' : `${room.topScore + 1 - shownScore} to take the lead`}</p></div></div>
          <div className={`timer ${seconds <= 2 && room.phase === 'picking' ? 'urgent' : ''}`}><span className="timer-label">{room.phase === 'picking' ? 'PICK YOUR NUMBER' : room.phase === 'intro' ? 'GET READY' : 'THE REVEAL'}</span><div className="timer-track"><span style={{ width: `${room.phase === 'picking' ? Math.max(0, Math.min(100, (room.deadline - now) / 60)) : 0}%` }} /></div><span>{room.phase === 'picking' ? `${seconds}s` : '—'}</span></div>
          <div className="duel"><div className={role === 'batting' ? 'duel-player yours' : 'duel-player'}><span className="eyebrow">BATTING{role === 'batting' ? ' · YOU' : ''}</span><strong>{batter?.name}</strong><FlipNumber key={`${room.ballId}-bat`} value={room.last?.bat} ready={room.ready.batter} revealed={revealed} elapsed={revealElapsed} /></div><span className="versus">VS</span><div className={role === 'bowling' ? 'duel-player yours' : 'duel-player'}><span className="eyebrow">BOWLING{role === 'bowling' ? ' · YOU' : ''}</span><strong>{bowler?.name}</strong><FlipNumber key={`${room.ballId}-bowl`} value={room.last?.bowl} ready={room.ready.bowler} revealed={revealed} elapsed={revealElapsed} bowling /></div></div>
          <div className={`ball-status ${momentReady && bigMoment ? 'has-moment' : ''}`} aria-live="polite">{room.phase === 'intro' ? <><strong>{superOver ? 'One ball. Make it count.' : `${batter?.name}, take your mark.`}</strong><span>Starting in {seconds}…{superOver ? ' Highest Super Over score wins; another tie is shared.' : ''}</span></> : momentReady ? <>{bigMoment ? <CrowdMoment key={room.ballId} label={bigMoment} out={!!room.last?.out} elapsed={revealElapsed - 420} /> : <strong className={room.last?.out ? 'out-text' : 'runs-text'}>{room.last?.out ? 'OUT!' : room.last?.bat === null ? 'DOT BALL. TIME’S UP.' : `+${room.last?.runs} RUN${room.last?.runs === 1 ? '' : 'S'}!`}</strong>}<span>{room.last?.out ? 'Same number. That’s the innings.' : room.last?.bat === null ? 'No batting pick. Zero runs.' : 'Different numbers. On the board.'}{room.last?.automatic ? ' Bowler timed out: random pick.' : ''}</span></> : room.phase === 'reveal' ? <><strong>{revealed ? 'Here we go…' : 'Choices locked.'}</strong><span>All eyes on the numbers.</span></> : <><strong>{role === 'watching' ? 'Watch the mind games.' : selected != null ? `${selected} locked. Keep your poker face.` : `You’re ${role}. Pick your number.`}</strong><span>{role === 'watching' ? 'Both picks stay secret until the reveal.' : selected != null ? 'Your opponent can’t see your number.' : 'Tap once to lock. No take-backs.'}</span></>}</div>

          <div className="ball-history"><span>THIS INNINGS</span>{Array.from({ length: superOver ? 1 : 6 }, (_, i) => { const b = inningsHistory[i]; return <span className={`ball-chip ${b?.out ? 'wicket' : b ? 'played' : ''}`} key={i}>{b ? b.out ? 'W' : b.runs === 0 ? '•' : b.runs : '–'}</span>; })}</div>
          {role !== 'watching' ? <div className="number-pad" role="group" aria-label="Choose your number">{[1, 2, 3, 4, 5, 6].map(n => <button key={n} className={selected === n ? 'selected' : ''} disabled={!canPick} onClick={() => choose(n)} aria-label={`Pick ${n}`} aria-pressed={selected === n}>{n}{selected === n && <Check size={18} />}</button>)}</div> : <div className="spectator-box"><Radio size={20} /><div><strong>YOU’RE WATCHING LIVE</strong><p>{spectator ? 'You joined mid-match. You can play in the next one.' : player(room.roundOrder[room.turn + 1]) ? `Next to bat: ${player(room.roundOrder[room.turn + 1])?.name}` : 'The finish line is close.'}</p></div></div>}

        </div>}
        <div className="reactions"><span>FROM THE STANDS</span><div>{['👏', '🔥', '😂', '😮'].map(emoji => <button key={emoji} aria-label={`React ${emoji}`} onClick={() => act('react', { emoji }).catch(() => {})}>{emoji}</button>)}</div><div className="reaction-feed" aria-live="polite">{room.reactions.slice(-2).map(r => <span key={r.id}>{r.emoji} {r.name}</span>)}</div></div>
      </section><aside className="sidebar"><div className="side-panel"><div className="section-heading"><Trophy size={18} /><h2>{room.phase === 'lobby' ? 'How to play' : 'Leaderboard'}</h2></div>{room.phase !== 'lobby' && <div className="leaderboard">{rows.filter(p => room.order.includes(p.id)).map((p, i) => <div key={p.id} className={p.id === room.batter && room.phase !== 'finished' ? 'current' : ''}><span className="rank">{i + 1}</span><div><strong>{p.name}{p.id === me ? ' (you)' : ''}</strong><small>{superOver && p.superScore !== null ? `Super Over: ${p.superScore}` : p.id === room.batter && room.phase !== 'finished' ? 'Batting now' : p.done ? p.out ? 'Out' : 'Innings complete' : 'Yet to bat'}{!p.connected ? ' · Away' : ''}</small></div><b>{p.score}</b></div>)}</div>}<div className="side-rules">{RULES.map((text, i) => <p key={text}><b>{i + 1}</b>{text}</p>)}</div></div><div className="super-note"><Zap size={20} /><div><strong>Tied at the top?</strong><p>One ball each. Random bowlers. Highest Super Over score wins. Still tied? Share the glory.</p></div></div><p className="rejoin-note">Accidental refresh? Your seat stays yours in this browser.</p></aside></div>
    </>}
    <footer><span>HAND CRICKET LIVE</span><span>Small numbers. Big rivalries.</span></footer>
  </main>;
}
