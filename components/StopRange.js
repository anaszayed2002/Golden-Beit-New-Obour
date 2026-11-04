'use client';
import { money, toEnglishDigits } from '@/lib/site';

// A two-handle bar that snaps to fixed stops, plus من / إلى boxes for any exact number.
// Typing a number moves the handle to where that number sits between the stops.
// stops: ascending numbers; the last one may be Infinity ("أكثر من ..."). '' means no limit.
const THUMB = 26;

function posOf(stops, v, end) {
  const last = stops.length - 1;
  if (v === '' || v == null) return end === 'min' ? 0 : last;
  const n = Number(v);
  const finite = stops[last] === Infinity ? last - 1 : last;
  if (n <= stops[0]) return 0;
  if (n >= stops[finite]) return n > stops[finite] && finite < last ? last : finite;
  for (let i = 0; i < finite; i++) {
    if (n <= stops[i + 1]) return i + (n - stops[i]) / (stops[i + 1] - stops[i]);
  }
  return finite;
}

export default function StopRange({ id, label, unit, stops, labels, min, max, onChange }) {
  const last = stops.length - 1;
  const pMin = posOf(stops, min, 'min');
  const pMax = Math.max(pMin, posOf(stops, max, 'max'));
  const at = (p) => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${p / last})`;
  const clean = (v) => toEnglishDigits(v).replace(/[^\d]/g, '');

  function drag(end, raw) {
    let i = Math.round(Number(raw));
    if (end === 'min') {
      i = Math.min(i, Math.round(pMax));
      onChange(i === 0 ? '' : String(stops[i] === Infinity ? stops[i - 1] : stops[i]), max);
    } else {
      i = Math.max(i, Math.round(pMin));
      onChange(min, stops[i] === Infinity ? '' : String(stops[i]));
    }
  }
  const shown = (v, end) => (v === ''
    ? (end === 'min' ? (stops[0] === 0 ? `0 ${unit}` : 'من غير حد أدنى') : 'من غير حد أقصى')
    : `${money(v)} ${unit}`);

  return (
    <div className="f w2 srange">
      <label htmlFor={`${id}-min`}>{label}</label>
      <div className="sr-now"><span>{shown(min, 'min')}</span><span aria-hidden="true">←</span><span>{shown(max, 'max')}</span></div>
      <div className="sr-bar" style={{ '--thumb': `${THUMB}px` }}>
        <div className="sr-track" />
        <div className="sr-fill" style={{ insetInlineStart: at(pMin), width: `calc((100% - ${THUMB}px) * ${(pMax - pMin) / last})` }} />
        {stops.map((s, i) => <i key={i} className={`sr-tick${i >= pMin - 0.001 && i <= pMax + 0.001 ? ' on' : ''}`} style={{ insetInlineStart: at(i) }} />)}
        <input type="range" min={0} max={last} step="any" value={pMin} aria-label={`${label}: أقل حاجة`} onChange={(e) => drag('min', e.target.value)} />
        <input type="range" min={0} max={last} step="any" value={pMax} aria-label={`${label}: أكبر حاجة`} onChange={(e) => drag('max', e.target.value)} />
      </div>
      <div className="sr-labels" aria-hidden="true">
        {labels.map((t, i) => t && <span key={i} style={{ insetInlineStart: at(i) }}>{t}</span>)}
      </div>
      <div className="pair">
        <input id={`${id}-min`} type="text" inputMode="numeric" placeholder="من" aria-label={`${label} من`}
          value={min === '' ? '' : money(min)} onChange={(e) => onChange(clean(e.target.value), max)} />
        <input type="text" inputMode="numeric" placeholder="إلى" aria-label={`${label} إلى`}
          value={max === '' ? '' : money(max)} onChange={(e) => onChange(min, clean(e.target.value))} />
      </div>
    </div>
  );
}
