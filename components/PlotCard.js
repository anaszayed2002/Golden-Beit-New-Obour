'use client';
import { SITE, money, listingCode, areaOf, placeOf, waLink } from '@/lib/site';
import SheetTop from './SheetTop';
import { photoUrl } from '@/lib/supabase';
import { WhatsAppIcon } from './icons';

// A simple sketch of the plot: the plot in the middle, neighbours around it, the street in front.
// ناصية adds a side street; the view (حديقة / خدمات) shows on the block behind it.
function Sketch({ x }) {
  const corner = x.facade === 'ناصية';
  const back = x.view_type === 'حديقة' ? ['حديقة', 'park'] : x.view_type === 'خدمات' ? ['خدمات', 'svc'] : ['', ''];
  const street = x.view_type === 'شارع رئيسي' ? 'شارع رئيسي' : 'شارع';
  return (
    <svg className="sketch" viewBox="0 0 320 210" role="img" aria-label={`رسم القطعة: ${areaOf(x)} م²`}>
      <rect className={`blk ${back[1]}`} x="118" y="8" width="84" height="44" rx="3" />
      {back[0] && <text className="blk-t" x="160" y="35">{back[0]}</text>}
      <rect className="blk" x="20" y="60" width="84" height="104" rx="3" />
      {corner
        ? <><rect className="road" x="216" y="0" width="104" height="210" /><text className="road-t" x="268" y="105" transform="rotate(-90 268 105)">شارع</text></>
        : <rect className="blk" x="216" y="60" width="84" height="104" rx="3" />}
      <rect className="plot" x="114" y="56" width="92" height="112" rx="4" />
      <text className="plot-t" x="160" y="118"><tspan className="num">{areaOf(x)}</tspan> م²</text>
      <rect className="road" x="0" y="176" width={corner ? 216 : 320} height="34" />
      <text className="road-t" x={corner ? 108 : 160} y="198">{street}</text>
    </svg>
  );
}

export default function PlotCard({ x, onClose }) {
  const services = [x.facade, x.view_type].filter(Boolean).join(' · ');
  const rows = [
    ['المنطقة', [placeOf(x), x.district].filter(Boolean).join(' / ')],
    ['المجاورة', x.neighborhood],
    ['المساحة', <><span className="num">{areaOf(x)}</span> م²</>],
    ['الخدمات', services],
    ['الأوفر', Number(x.over_amount) > 0 ? <><span className="num">{money(x.over_amount)}</span> ج</> : ''],
  ].filter(([, v]) => v);
  const msg = `السلام عليكم، أنا مهتم بالقطعة كود ${listingCode(x)}: ${placeOf(x)}، ${areaOf(x)} م²، السعر ${money(x.price)} جنيه.`;
  return (
    <div className="modal center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet narrow has-top pcard-sheet" role="dialog" aria-label={`بطاقة ${listingCode(x)}`}>
        <SheetTop title="بطاقة القطعة" onClose={onClose} />
        <article className="pcard">
          {x.photo ? <img className="pc-photo" src={photoUrl(x.photo)} alt={`صورة القطعة ${listingCode(x)}`} /> : <Sketch x={x} />}
          <dl>
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            <div className="pc-price"><dt>السعر الكلي</dt><dd><span className="num">{money(x.price)}</span> ج</dd></div>
          </dl>
          <footer>
            <div className="pc-brand">
              <img src="/logo.png" alt="" />
              <span><b>جولدن بيت</b><small className="num">{listingCode(x)}</small></span>
            </div>
            <a className="pc-wa" href={waLink(msg)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon /><span className="num">{SITE.phone}</span></a>
          </footer>
        </article>
      </div>
    </div>
  );
}
