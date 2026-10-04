'use client';

import { useRef, type CSSProperties } from 'react';
import { Check } from 'lucide-react';

// Presentation only: both cards use the existing server reveal timestamp.
export function FlipNumber({ value, ready, revealed, elapsed, bowling = false }: {
  value: number | null | undefined; ready: boolean; revealed: boolean; elapsed: number; bowling?: boolean;
}) {
  const catchup = useRef<number | null>(null);
  if (revealed && catchup.current === null) catchup.current = Math.max(0, elapsed);
  return <div className={`number-tile ${bowling ? 'bowler-tile' : ''}`} role="img" aria-label={revealed ? `Revealed number: ${value ?? 'no pick'}` : ready ? 'Choice locked' : 'Choosing in secret'}>
    <div className={`flip-card ${revealed ? 'is-flipped' : ''}`} style={{ animationDelay: `-${catchup.current ?? 0}ms` }} aria-hidden="true">
      <div className="card-face card-front">{ready ? <Check size={32} /> : '?'}<span>{ready ? 'LOCKED' : 'SECRET'}</span></div>
      <div className="card-face card-back">{revealed ? value ?? '—' : '?'}</div>
    </div>
  </div>;
}

export function CrowdMoment({ label, out, elapsed }: { label: string; out: boolean; elapsed: number }) {
  const catchup = useRef(Math.max(0, elapsed));
  return <div className={`crowd-moment ${out ? 'wicket-moment' : ''}`} style={{ '--catchup': `-${catchup.current}ms` } as CSSProperties}>
    <div className="crowd-particles" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--drift': `${(i % 2 ? 1 : -1) * (18 + i * 3)}px`, '--turn': `${i * 47}deg`, '--lag': `${i % 4 * 45}ms` } as CSSProperties} />)}</div>
    <strong className="moment-word">{label}</strong>
    <span className="crowd-chant">{out ? 'HOWZAAAT! THE STANDS ERUPT.' : label === 'SIX!' ? 'INTO THE STANDS!' : 'THE CROWD GOES WILD!'}</span>
    <div className="crowd-wave" aria-hidden="true">{['🙌', '👏', '🙌', '👏', '🙌', '👏', '🙌'].map((emoji, i) => <span key={i} style={{ '--lag': `${i * 50}ms` } as CSSProperties}>{emoji}</span>)}</div>
  </div>;
}
