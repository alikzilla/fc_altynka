import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { haptic } from '../lib/tg';

const LEVELS = {
  skills: ['Начинаю', 'Базовые навыки', 'Уверенно играю', 'Сильная сторона', 'Очень высокий уровень'],
  player: ['Игра не получилась', 'Ниже обычного', 'Уверенная игра', 'Сильный матч', 'Отличная игра'],
  match: ['Не понравилась', 'Скорее не понравилась', 'Нормальная игра', 'Хорошая игра', 'Отличная игра'],
};
type Props = { label: string; value: number | undefined; onChange: (value: number) => void; onCommit?: (value: number, origin: 'pointer' | 'keyboard') => void; disabled?: boolean; kind?: keyof typeof LEVELS };

/** One spring owns the numeral's presentation and velocity, including rapid reversals. */
function ScoreReel({ value, immediate }: { value: number | undefined; immediate: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const spring = useRef({ position: value ?? 5, target: value ?? 5, velocity: 0, frame: 0, time: 0 });
  useLayoutEffect(() => {
    const motion = spring.current;
    motion.target = value ?? 5;
    root.current!.dataset.settled = 'false';
    const digits = [...root.current!.querySelectorAll<HTMLElement>('[data-digit]')];
    const paint = () => {
      for (const digit of digits) {
        const distance = Number(digit.dataset.digit) - motion.position;
        const angle = Math.max(-35, Math.min(35, distance * 22));
        digit.style.transform = `translate3d(0, ${distance * 106}%, 0) rotateX(${angle}deg) scale(${Math.max(.86, 1 - Math.abs(distance) * .08)})`;
        digit.style.opacity = String(Math.max(0, 1 - Math.abs(distance) * .85));
      }
    };
    if (immediate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      cancelAnimationFrame(motion.frame); motion.frame = 0; motion.position = motion.target; motion.velocity = 0; root.current!.dataset.settled = 'true'; paint(); return;
    }
    if (motion.frame) return; // Retarget the running spring without discarding its velocity.
    motion.time = performance.now();
    const step = (time: number) => {
      const dt = Math.min(32, Math.max(0, time - motion.time)) / 1000;
      motion.time = time;
      motion.velocity += ((motion.target - motion.position) * 480 - motion.velocity * 38) * dt;
      motion.position += motion.velocity * dt;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || Math.abs(motion.target - motion.position) < .001 && Math.abs(motion.velocity) < .01) {
        motion.position = motion.target; motion.velocity = 0; motion.frame = 0; root.current!.dataset.settled = 'true'; paint(); return;
      }
      paint(); motion.frame = requestAnimationFrame(step);
    };
    paint(); motion.frame = requestAnimationFrame(step);
  }, [value, immediate]);
  useLayoutEffect(() => () => { cancelAnimationFrame(spring.current.frame); spring.current.frame = 0; }, []);
  return <span ref={root} className="score-reel" data-empty={value === undefined || undefined} aria-hidden="true">
    <span className="score-reel-empty">—</span><span className="score-reel-digits">{Array.from({ length: 10 }, (_, i) => <span key={i + 1} data-digit={i + 1}>{i + 1}</span>)}</span>
  </span>;
}

export function RatingSlider({ label, value, onChange, onCommit, disabled = false, kind = 'skills' }: Props) {
  const id = useId();
  const pointer = useRef<number | null>(null);
  const interrupted = useRef(false);
  const keyboard = useRef(false);
  const lastValue = useRef(value);
  const selected = value ?? 5;
  const levels = LEVELS[kind];
  const description = value === undefined ? 'Выбери оценку' : levels[Math.floor((value - 1) / 2)];
  function change(next: number) {
    onChange(next);
    if (next !== lastValue.current && !keyboard.current) haptic('light');
    lastValue.current = next;
  }
  return <div className="rating-slider" data-unset={value === undefined || undefined}>
    <div className="score-display"><ScoreReel value={value} immediate={keyboard.current} /><span className="score-out-of" aria-hidden="true">из 10</span></div>
    <p className="score-description" id={`${id}-value`}>{description}</p>
    <div className="rating-slider-control" style={{ '--score-fill': (selected - 1) / 9 } as CSSProperties}>
      <div className="rating-slider-track" aria-hidden="true"><span /></div>
      <input type="range" min={1} max={10} step={1} value={selected} disabled={disabled} aria-label={label}
        aria-valuetext={value === undefined ? 'Оценка не выбрана' : `${value} из 10 — ${description}`} aria-describedby={`${id}-scale`}
        onChange={event => {
          if (interrupted.current) { event.target.value = String(lastValue.current ?? selected); return; }
          change(Number(event.target.value));
        }}
        onPointerDown={event => {
          if (disabled || pointer.current !== null || !event.isPrimary || event.button !== 0) {
            if (pointer.current !== null) interrupted.current = true;
            event.preventDefault(); return;
          }
          interrupted.current = false;
          keyboard.current = false; pointer.current = event.pointerId;
        }}
        onPointerUp={event => {
          if (pointer.current !== event.pointerId) return;
          pointer.current = null;
          if (disabled) return;
          const cancelled = interrupted.current;
          const next = cancelled ? lastValue.current ?? selected : Number(event.currentTarget.value);
          interrupted.current = false; change(next);
          if (!cancelled) onCommit?.(next, 'pointer');
        }}
        onPointerCancel={event => { if (pointer.current === event.pointerId) pointer.current = null; }}
        onLostPointerCapture={event => { if (pointer.current === event.pointerId) pointer.current = null; }}
        onBlur={() => { pointer.current = null; }}
        onKeyDown={event => {
          interrupted.current = false;
          keyboard.current = true;
          if (event.key === 'Enter' && value !== undefined) { event.preventDefault(); onCommit?.(value, 'keyboard'); }
        }} />
    </div>
    <div className="rating-slider-ends" aria-hidden="true"><span>1</span><span>10</span></div>
    <div className="slider-scale" id={`${id}-scale`}>{levels.map((text, i) => <p key={text} data-active={value !== undefined && Math.floor((value - 1) / 2) === i || undefined}><span>{i * 2 + 1}–{i * 2 + 2}</span>{text}</p>)}</div>
  </div>;
}
