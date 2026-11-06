'use client';
import { useState } from 'react';
import { money, listingCode, areaOf, placeOf, statusLabel, remainingOf, hasPayment, breakdown } from '@/lib/site';
import SheetTop from './SheetTop';

const ZOOMS = [0.7, 0.85, 1, 1.15, 1.3, 1.5];
const m = (v) => (v ? <><span className="num">{money(v)}</span> ج</> : '—');

// Each unit is one row; the table scrolls both ways and can be zoomed in or out.
const COLS = [
  ['المكان', (x) => placeOf(x)],
  ['الحي', (x) => x.district || '—'],
  ['المجاورة', (x) => x.neighborhood || '—'],
  ['المساحة', (x) => <><span className="num">{areaOf(x)}</span> م²</>],
  ['الحالة', (x) => statusLabel(x.land_status) || '—'],
  ['الواجهة', (x) => x.facade || '—'],
  ['الإطلالة', (x) => x.view_type || '—'],
  ['السعر الكلي', (x) => <b>{m(x.price)}</b>],
  ['المطلوب دفعه', (x) => (hasPayment(x) ? m(x.paid) : '—')],
  ['الأوفر', (x) => m(x.over_amount)],
  ['المتبقي', (x) => m(remainingOf(x))],
  ['قيمة القسط', (x) => m(x.pay?.inst?.value)],
  ['الأقساط المتبقية', (x) => { const b = breakdown(x); return b.inst ? <span className="num">{b.inst.leftN}</span> : (x.pay?.inst?.count ? <span className="num">{x.pay.inst.count}</span> : '—'); }],
];

export default function Compare({ items, onRemove, onClear, onOpen, onClose }) {
  const [z, setZ] = useState(2);
  return (
    <div className="modal cmp-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet has-top cmp-sheet" role="dialog" aria-label="قارن القطع">
        <SheetTop title={<>قارن القطع <small className="num">({items.length})</small></>} onClose={onClose} />
        <div className="cmp-tools">
          <div className="zoom" role="group" aria-label="تكبير وتصغير">
            <button type="button" onClick={() => setZ((v) => Math.max(0, v - 1))} disabled={z === 0} aria-label="تصغير">−</button>
            <span className="num">{Math.round(ZOOMS[z] * 100)}%</span>
            <button type="button" onClick={() => setZ((v) => Math.min(ZOOMS.length - 1, v + 1))} disabled={z === ZOOMS.length - 1} aria-label="تكبير">+</button>
          </div>
          {items.length > 0 && <button type="button" className="btn sm" onClick={onClear}>مسح الكل</button>}
        </div>
        {items.length === 0 ? (
          <div className="state"><b>مفيش قطع للمقارنة.</b><span>دوس "قارن" على أي قطعة علشان تضيفها هنا.</span></div>
        ) : (
          <div className="cmp-scroll">
            <table className="cmp" style={{ fontSize: `${14 * ZOOMS[z]}px` }}>
              <thead><tr><th className="stick">الوحدة</th>{COLS.map(([t]) => <th key={t}>{t}</th>)}<th /></tr></thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id}>
                    <th className="stick"><button type="button" className="linkbtn num" onClick={() => onOpen(x)}>{listingCode(x.id)}</button></th>
                    {COLS.map(([t, f]) => <td key={t}>{f(x)}</td>)}
                    <td><button type="button" className="cmp-x" onClick={() => onRemove(x.id)} aria-label={`شيل ${listingCode(x.id)} من المقارنة`}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
