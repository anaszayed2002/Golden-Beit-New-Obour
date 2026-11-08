'use client';
import { useState } from 'react';
import { LEGAL, PRICE_NOTE, legalCalc, exact, toEnglishDigits } from '@/lib/site';
import SheetTop from './SheetTop';

const j = (n) => <><b className="num">{exact(n)}</b> ج.م</>;
const m2 = (n) => <><b className="num">{exact(n)}</b> م²</>;

// The legalization cost explained step by step, in the words a broker would use with a client.
export function Explain({ c, onPick }) {
  if (!c) return null;
  return (
    <ol className="explain">
      <li><span className="ex-n">١</span><div>أصل مساحة الأرض {m2(c.a)}.</div></li>
      <li><span className="ex-n">٢</span><div>الجهاز بيخصم <b className="num">{c.cutPct * 100}%</b> للطرق والخدمات = {m2(c.cut)}، فيفضل لك <strong>صافي {m2(c.net)}</strong>.</div></li>
      <li><span className="ex-n">٣</span><div>
        {c.missing > 0 && <>أقرب شريحة رسمية ليك {m2(c.tier)}، يعني ناقصك {m2(c.missing)} بتشتريهم من الجهاز بـ {j(LEGAL.buyPerM)} للمتر = {j(c.missing * LEGAL.buyPerM)}.</>}
        {c.extra > 0 && <>أقرب شريحة رسمية ليك {m2(c.tier)}، يعني عندك {m2(c.extra)} زيادة بتبيعهم للجهاز بـ {j(LEGAL.sellPerM)} للمتر = {j(c.extra * LEGAL.sellPerM)} بتتخصم من التكلفة.</>}
        {!c.missing && !c.extra && <>صافيك بيساوي شريحة {m2(c.tier)} بالظبط، مفيش أمتار تشتريها أو تبيعها.</>}
        {c.options.length > 1 && onPick && (
          <div className="ex-pick">
            <span>مساحتك في النص تقريباً بين شريحتين، اختار:</span>
            {c.options.map((t) => <button key={t} type="button" aria-pressed={c.tier === t} onClick={() => onPick(t)}><span className="num">{t}</span> م²</button>)}
          </div>
        )}
      </div></li>
      <li><span className="ex-n">٤</span><div>تقنين الصافي: {m2(c.net)} × {j(c.perM)} للمتر = {j(c.legal)}.</div></li>
      <li><span className="ex-n">٥</span><div>إجمالي التكلفة {j(c.total)} + <b className="num">1.5%</b> مصاريف إدارية ({j(c.admin)}) = <strong>{j(c.grand)}</strong>.</div></li>
      <li><span className="ex-n">٦</span><div>المبلغ ده بيتقسم على <b>4 دفعات متساوية</b>، كل دفعة {j(c.quarter)}:
        <ul>
          <li><b>الدفعة الأولى:</b> شيك تقنين {j(c.check)} + {j(c.completion)} بالفيزا (دي دفعة الاستكمال).</li>
          <li><b>بعدها 3 أقساط:</b> 3 شيكات، كل شيك {j(c.quarter)}، بتتكتب قبل استلام الأرض.</li>
        </ul>
      </div></li>
      <li><span className="ex-n">٧</span><div>ومصاريف التنازل: {j(180)} × {m2(c.tier)} = {j(c.waiver)}.</div></li>
    </ol>
  );
}

// Stand-alone calculator: type the original area and read the explanation.
export function CalcModal({ onClose }) {
  const [a, setA] = useState('');
  const [tier, setTier] = useState('');
  const n = Number(toEnglishDigits(a));
  const c = legalCalc(n, tier);
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet has-top calc-sheet" role="dialog" aria-label="حاسبة التقنين">
        <SheetTop title="حاسبة تكلفة التقنين" onClose={onClose} />
        <p className="sub">اكتب أصل مساحة الأرض، وهنطلعلك التكلفة خطوة بخطوة.</p>
        <div className="over-in calc-in">
          <input type="number" inputMode="decimal" min="0" placeholder="مثلاً 300" value={a} autoFocus
            onChange={(e) => { setA(e.target.value); setTier(''); }} aria-label="أصل المساحة بالمتر" />
          <span>م²</span>
        </div>
        {a && !c && (
          <p className="pi-note">{n < LEGAL.minArea ? `أقل مساحة ${LEGAL.minArea} م².` : 'حسبة المساحات من 500 م² وطالع لسه بتتراجع. كلمنا على واتساب وهنحسبهالك.'}</p>
        )}
        <Explain c={c} onPick={setTier} />
        <p className="price-note-inline">{PRICE_NOTE}</p>
      </div>
    </div>
  );
}

// The price note, always open, placed right where prices are shown.
export function PriceNote({ compact }) {
  return (
    <p className={`price-note${compact ? ' compact' : ''}`} role="note">
      <span className="pn-ic" aria-hidden="true">ⓘ</span>
      <span>{PRICE_NOTE}</span>
    </p>
  );
}

// Always-visible bubble on the left edge; tap to read the full note.
export function PriceBubble() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`price-bubble${open ? ' open' : ''}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span aria-hidden="true">ⓘ</span> {open ? 'إخفاء' : 'الأسعار استرشادية'}
      </button>
      {open && <p role="note">{PRICE_NOTE}</p>}
    </div>
  );
}

// Scalloped edge of the seal, as polygon points on a 100x100 box.
const SEAL_PTS = Array.from({ length: 48 }, (_, i) => {
  const ang = (i / 48) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 ? 42 : 47;
  return `${(50 + r * Math.cos(ang)).toFixed(2)},${(50 + r * Math.sin(ang)).toFixed(2)}`;
}).join(' ');

// A gold seal fixed on the left edge; the full note sits beside it in a very faint box.
export function PriceSeal() {
  return (
    <>
    <p className="seal-note-bg" role="note">{PRICE_NOTE}</p>
    <div className="price-seal">
      <span className="seal-badge" aria-hidden="true">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <polygon points={SEAL_PTS} fill="url(#seal-gold)" stroke="#9a7417" strokeWidth="1.2" strokeLinejoin="round" />
          <circle cx="50" cy="50" r="34" fill="#0A3022" stroke="#f3d77a" strokeWidth="2.5" />
          <circle cx="50" cy="50" r="29.5" fill="none" stroke="#f3d77a55" strokeWidth="1" />
          <text x="50" y="49" textAnchor="middle" fontSize="12.5" fontWeight="800" fill="#fff">أسعار</text>
          <text x="50" y="64" textAnchor="middle" fontSize="11" fontWeight="800" fill="#f3d77a">استرشادية</text>
          <defs>
            <linearGradient id="seal-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fbe7a1" /><stop offset=".5" stopColor="#d9a92e" /><stop offset="1" stopColor="#a87b14" />
            </linearGradient>
          </defs>
        </svg>
      </span>
    </div>
    </>
  );
}
