'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  SITE, STATUSES, FACADES, VIEWS, RECEIVED_STATUS, PHONE_RE, money, listingCode, waLink, areaOf,
  remainingOf, hasPayment, payRows, statusLabel, parseCode, normalizePhone, serverError, toEnglishDigits,
  DISTRICTS, NEIGHBORHOODS, instValueOf, instCountOf, instLeftCountOf,
} from '@/lib/site';
import StopRange from './StopRange';

// "—" instead of a misleading 0 when a listing has no paid/over amount.
const Amount = ({ x, value, className, unit = 'ج' }) => (hasPayment(x)
  ? <span className={className}><span className="num">{money(value)}</span><span className="cur">{unit}</span></span>
  : <span className="muted">—</span>);
import { useToast, useBodyLock, useEscape } from './hooks';
import ListingWizard from './ListingWizard';
import SheetTop from './SheetTop';
import Footer from './Footer';
import { WhatsAppIcon } from './icons';

const LISTING_COLUMNS = 'id,zone,area,district,neighborhood,area_orig,area_final,land_status,facade,view_type,price,paid,over_amount,pay,description,created_at';
const EMPTY = {
  zone: '', district: '', neighborhood: '', status: '', facade: '', view: '',
  pmin: '', pmax: '', amin: '', amax: '', paid: '', over: '', rem: '', ival: '', ileft: '',
  inst: false, received: false, check: false, completion: false,
};
const AREA_STOPS = [209, 276, 300, 350, 400, 450, 500, Infinity];
const AREA_LABELS = ['209', '276', '300', '350', '400', '450', '500', '+500'];
const PRICE_STOPS = [0, ...Array.from({ length: 11 }, (_, i) => 1000000 + i * 500000), Infinity];
const PRICE_LABELS = PRICE_STOPS.map((v, i) => (v === 0 ? '0' : v === Infinity ? '+6 مليون' : i % 2 && i < 11 ? `${v / 1e6} مليون` : ''));

// Every sort works both ways: [key, label, value-of].
const SORT_FIELDS = [
  ['date', 'تاريخ النشر', (x) => new Date(x.created_at).getTime()],
  ['price', 'السعر الكلي', (x) => x.price],
  ['area', 'المساحة', (x) => areaOf(x)],
  ['paid', 'المدفوع', (x) => x.paid],
  ['over', 'الأوفر', (x) => x.over_amount],
  ['rem', 'المتبقي (أقساط)', (x) => remainingOf(x)],
  ['ival', 'قيمة القسط', (x) => instValueOf(x)],
  ['ileft', 'عدد الأقساط المتبقية', (x) => instLeftCountOf(x) ?? instCountOf(x)],
  ['code', 'كود الوحدة', (x) => x.id],
];
const sorter = (key) => {
  const [field, dir] = (key || 'date:-1').split(':');
  const f = (SORT_FIELDS.find(([k]) => k === field) || SORT_FIELDS[0])[2];
  return (a, b) => (f(a) - f(b)) * Number(dir || -1);
};

const activeCount = (f) => Object.values(f).filter((v) => v !== '' && v !== false).length;

function applyFilters(list, f) {
  const n = (v, d) => (v === '' ? d : Number(v));
  return list.filter((x) =>
    (!f.zone || x.zone === f.zone) && (!f.district || x.district === f.district) && (!f.neighborhood || x.neighborhood === f.neighborhood) &&
    (!f.status || x.land_status === Number(f.status)) && (!f.facade || x.facade === f.facade) && (!f.view || x.view_type === f.view) &&
    x.price >= n(f.pmin, 0) && x.price <= n(f.pmax, Infinity) &&
    areaOf(x) >= n(f.amin, 0) && areaOf(x) <= n(f.amax, Infinity) &&
    x.paid <= n(f.paid, Infinity) && x.over_amount <= n(f.over, Infinity) && remainingOf(x) <= n(f.rem, Infinity) &&
    (f.ival === '' || (instValueOf(x) > 0 && instValueOf(x) <= Number(f.ival))) &&
    (f.ileft === '' || (instLeftCountOf(x) ?? instCountOf(x)) <= Number(f.ileft)) &&
    (!f.inst || !!x.pay?.inst) && (!f.received || x.land_status === RECEIVED_STATUS) &&
    (!f.check || !!x.pay?.check) && (!f.completion || !!x.pay?.completion));
}

export default function Market() {
  const [listings, setListings] = useState(null);
  const [zones, setZones] = useState({});
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState(EMPTY);
  const [sort, setSort] = useState('date:-1');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null); // 'offer' | {type:'sent', id}
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    const [l, z] = await Promise.all([
      supabase.from('nob_listings').select(LISTING_COLUMNS).eq('status', 'approved').order('created_at', { ascending: false }),
      supabase.from('nob_zones').select('name,location,axes,services'),
    ]);
    if (l.error) { setLoadError(true); setListings([]); return; }
    setLoadError(false);
    setListings(l.data.map((x) => ({ ...x, price: Number(x.price), paid: Number(x.paid), over_amount: Number(x.over_amount) })));
    if (!z.error) setZones(Object.fromEntries(z.data.map((r) => [r.name, r])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const all = listings || [];
  const visible = useMemo(() => applyFilters(all, filters).sort(sorter(sort)), [all, filters, sort]);
  const nActive = activeCount(filters);
  const setRange = (a, b) => (lo, hi) => setFilters((f) => ({ ...f, [a]: lo, [b]: hi }));
  const set = (k, v) => setFilters((f) => {
    const next = { ...f, [k]: v };
    return next;
  });

  useBodyLock(!!selected || !!modal || filtersOpen);
  useEscape(useCallback(() => {
    if (sortOpen) setSortOpen(false); else if (modal) setModal(null); else if (filtersOpen) setFiltersOpen(false); else setSelected(null);
  }, [modal, filtersOpen, sortOpen]));

  function openCode(e) {
    e.preventDefault();
    const id = parseCode(code);
    if (!id) return setCodeMsg('اكتب الكود، مثلاً GB-104.');
    const x = all.find((l) => l.id === id);
    if (!x) return setCodeMsg(`مفيش قطعة منشورة بالكود ${listingCode(id)}.`);
    setCodeMsg('');
    setSelected(x);
  }

  async function submitOffer(payload) {
    const { data, error } = await supabase.rpc('nob_submit_offer', { p: payload });
    if (error) return serverError(error, 'مقدرناش نبعت الإعلان. جرب تاني.');
    setModal({ type: 'sent', id: data });
    return '';
  }

  return (
    <>
      <header className="site-header">
        <div className="wrap top">
          <a className="brand" href="/" aria-label={SITE.name}>
            <img src="/logo.png" alt="جولدن بيت Golden Beit" />
            <span className="sub"><b><span>Golden Beit</span> <span>New Obour</span></b></span>
          </a>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <h1>أراضي القادسية والأمل في العبور الجديدة</h1>
          <p>معاك كود قطعة؟ اكتبه هنا وافتحها على طول.</p>
          <form className="codebox" onSubmit={openCode} autoComplete="off" role="search">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="كود القطعة، مثلاً GB-104" aria-label="كود القطعة" />
            <button className="btn" type="submit">افتح</button>
          </form>
          <div className="code-msg" role="status">{codeMsg}</div>
        </div>
      </section>

      <main className="wrap market">
        <div className="stats">
          <button className="stat-main" aria-pressed={!filters.zone && nActive === 0} onClick={() => setFilters(EMPTY)}>
            <span>القطع المعروضة</span><strong className="num">{all.length}</strong>
            <span className="split" aria-hidden="true">
              {SITE.zones.map((z) => <i key={z} style={{ flexGrow: all.filter((x) => x.zone === z).length || 0.0001 }} />)}
            </span>
          </button>
          <div className="stat-kids">
            {SITE.zones.map((z) => (
              <button key={z} className="stat-kid" aria-pressed={filters.zone === z} onClick={() => set('zone', filters.zone === z ? '' : z)}>
                <span>{z}</span><strong className="num">{all.filter((x) => x.zone === z).length}</strong>              </button>
            ))}
          </div>
        </div>

        <div className="toolbar">
          <h2>القطع المعروضة <small><span className="num">{visible.length}</span> قطعة</small></h2>
          <button className="btn" id="filter-btn" onClick={() => setFiltersOpen(true)}>
            الفلتر {nActive > 0 && <span className="fcount num">{nActive}</span>}
          </button>
          <div className="sortwrap">
            <button className="btn sortbtn" aria-haspopup="listbox" aria-expanded={sortOpen} onClick={() => setSortOpen((o) => !o)}>
              رتب القطع حسب
              <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {sortOpen && (<>
              <div className="sort-scrim" onClick={() => setSortOpen(false)} />
              <div className="sortmenu" role="listbox" aria-label="رتب القطع حسب">
                {SORT_FIELDS.map(([k, t]) => [
                  [`${k}:-1`, k === 'date' ? 'الأحدث الأول' : k === 'code' ? 'كود الوحدة: الأكبر الأول' : `${t}: تنازلي`],
                  [`${k}:1`, k === 'date' ? 'الأقدم الأول' : k === 'code' ? 'كود الوحدة: الأصغر الأول' : `${t}: تصاعدي`],
                ]).flat().map(([v, label]) => (
                  <button key={v} role="option" aria-selected={sort === v} onClick={() => { setSort(v); setSortOpen(false); }}>{label}</button>
                ))}
              </div>
            </>)}
          </div>
        </div>

        {filtersOpen && <div className="scrim filters-scrim" onClick={() => setFiltersOpen(false)} />}
        <div className={`filters${filtersOpen ? ' open' : ''}`} role="search" aria-label="الفلتر">
          <SheetTop title="الفلتر" onClose={() => setFiltersOpen(false)} />
          <div className="f"><label htmlFor="f-zone">التقسيم</label>
            <select id="f-zone" value={filters.zone} onChange={(e) => set('zone', e.target.value)}>
              <option value="">الكل</option>{SITE.zones.map((z) => <option key={z}>{z}</option>)}
            </select></div>
          <div className="f"><label htmlFor="f-dist">الحي</label>
            <select id="f-dist" value={filters.district} onChange={(e) => set('district', e.target.value)}>
              <option value="">الكل</option>{DISTRICTS.map((v) => <option key={v}>{v}</option>)}
            </select></div>
          <div className="f"><label htmlFor="f-nb">المجاورة</label>
            <select id="f-nb" value={filters.neighborhood} onChange={(e) => set('neighborhood', e.target.value)}>
              <option value="">الكل</option>{NEIGHBORHOODS.map((v) => <option key={v}>{v}</option>)}
            </select></div>
          <div className="f w2"><label htmlFor="f-status">الحالة</label>
            <select id="f-status" value={filters.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">الكل</option>{STATUSES.map((t, i) => <option key={t} value={i + 1}>{t}</option>)}
            </select></div>
          <div className="f"><label htmlFor="f-facade">الواجهة</label>
            <select id="f-facade" value={filters.facade} onChange={(e) => set('facade', e.target.value)}>
              <option value="">الكل</option>{FACADES.map((v) => <option key={v}>{v}</option>)}
            </select></div>
          <div className="f"><label htmlFor="f-view">الإطلالة</label>
            <select id="f-view" value={filters.view} onChange={(e) => set('view', e.target.value)}>
              <option value="">الكل</option>{VIEWS.map((v) => <option key={v}>{v}</option>)}
            </select></div>
          <StopRange id="f-area" label="المساحة بعد التقنين (م²)" unit="م²" stops={AREA_STOPS} labels={AREA_LABELS}
            min={filters.amin} max={filters.amax} onChange={setRange('amin', 'amax')} />
          <StopRange id="f-price" label="السعر الكلي (جنيه)" unit="ج" stops={PRICE_STOPS} labels={PRICE_LABELS}
            min={filters.pmin} max={filters.pmax} onChange={setRange('pmin', 'pmax')} />
          {[['paid', 'المدفوع لحد', 'أقصى مبلغ'], ['over', 'الأوفر لحد', 'أقصى مبلغ'], ['rem', 'المتبقي (أقساط) لحد', 'أقصى مبلغ'],
            ['ival', 'قيمة القسط لحد', 'أقصى قسط'], ['ileft', 'عدد الأقساط المتبقية لحد', 'أقصى عدد']].map(([k, t, ph]) => (
            <div className="f" key={k}><label htmlFor={`f-${k}`}>{t}</label>
              <input id={`f-${k}`} type="text" inputMode="numeric" placeholder={ph}
                value={filters[k] === '' ? '' : money(filters[k])} onChange={(e) => set(k, toEnglishDigits(e.target.value).replace(/[^\d]/g, ''))} /></div>
          ))}
          <div className="f w2 chks">
            <label className="chk"><input type="checkbox" checked={filters.inst} onChange={(e) => set('inst', e.target.checked)} /> بالتقسيط</label>
            <label className="chk"><input type="checkbox" checked={filters.received} onChange={(e) => set('received', e.target.checked)} /> مستلمة</label>
            <label className="chk"><input type="checkbox" checked={filters.check} onChange={(e) => set('check', e.target.checked)} /> مدفوع شيك التقنين</label>
            <label className="chk"><input type="checkbox" checked={filters.completion} onChange={(e) => set('completion', e.target.checked)} /> مدفوع الاستكمال</label>
          </div>
          <div className="factions">
            <button className="btn" onClick={() => setFilters(EMPTY)}>مسح الفلتر</button>
            <button className="btn primary apply" onClick={() => setFiltersOpen(false)}>اعرض النتايج</button>
          </div>
        </div>

        {listings === null ? (
          <div className="state">بنحمّل القطع...</div>
        ) : loadError ? (
          <div className="state">مقدرناش نحمّل القطع. <button className="linkbtn" onClick={load}>جرب تاني</button></div>
        ) : all.length === 0 ? (
          <div className="state">
            <b>لسه مفيش قطع معروضة.</b>
            <span>عندك قطعة في القادسية أو الأمل؟ اعرضها وهتنزل هنا بعد مراجعة الإدارة.</span>
          </div>
        ) : (
          <>
            <div className="tablebox listings"><table>
              <thead><tr>
                <th>الكود</th><th>المكان</th><th>المساحة</th><th>الحالة</th><th>السعر الكلي</th><th>المدفوع</th><th>المتبقي (أقساط)</th>
                <th><span className="sr-only">التفاصيل</span></th>
              </tr></thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={8} className="empty">مفيش قطع بالمواصفات دي. جرّب توسّع الفلتر.</td></tr>}
                {visible.map((x) => (
                  <tr key={x.id} tabIndex={0} className={selected?.id === x.id ? 'sel' : ''}
                    onClick={() => setSelected(x)} onKeyDown={(e) => e.key === 'Enter' && setSelected(x)}>
                    <td className="code num">{listingCode(x.id)}</td>
                    <td className="place"><span className="zone">{x.zone}</span>
                      {(x.district || x.neighborhood) && <small>{[x.district, x.neighborhood].filter(Boolean).join(' · ')}</small>}</td>
                    <td><span className="num">{areaOf(x)}</span> م²</td>
                    <td>{x.land_status ? <span className={`pill ${x.land_status === RECEIVED_STATUS ? 'got' : 'st'}`}>{statusLabel(x.land_status)}</span> : <span className="muted">—</span>}</td>
                    <td className="price"><span className="num">{money(x.price)}</span><span className="cur">ج</span></td>
                    <td><Amount x={x} value={x.paid} className="paid" /></td>
                    <td>{remainingOf(x) > 0 ? <span className="rem"><span className="num">{money(remainingOf(x))}</span><span className="cur">ج</span></span> : <span className="muted">—</span>}</td>
                    <td className="more-cell">
                      <button className="btn more" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setSelected(x); }}>
                        تفاصيل أكثر <span aria-hidden="true">←</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="rows">
              {visible.length === 0 && <div className="empty">مفيش قطع بالمواصفات دي. جرّب توسّع الفلتر.</div>}
              {visible.map((x) => (
                <button key={x.id} className="row" onClick={() => setSelected(x)}>
                  <div className="r-top">
                    <span className="r-zone">{x.zone}</span>
                    <span className="r-code">كود الوحدة <b className="num">{listingCode(x.id)}</b></span>
                  </div>
                  {(x.district || x.neighborhood) && (
                    <div className="r-loc">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
                      </svg>
                      {[x.district, x.neighborhood].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div className="r-facts">
                    <div><span className="k">المساحة</span><b><span className="num">{areaOf(x)}</span> م²</b></div>
                    {x.land_status
                      ? <div><span className="k">الحالة</span><b>{statusLabel(x.land_status)}</b></div>
                      : x.facade ? <div><span className="k">الواجهة</span><b>{x.facade}</b></div> : null}
                  </div>
                  <div className="r-price">
                    <span className="k">السعر المطلوب</span>
                    <b><span className="num">{money(x.price)}</span> <small>جنيه</small></b>
                  </div>
                  {(hasPayment(x) || remainingOf(x) > 0) && (
                    <div className="r-pay">
                      {hasPayment(x) && <span>المدفوع <b className="paid num">{money(x.paid)}</b></span>}
                      {remainingOf(x) > 0 && <span>المتبقي (أقساط) <b className="rem num">{money(remainingOf(x))}</b></span>}
                    </div>
                  )}
                  <span className="btn more block" aria-hidden="true">تفاصيل أكثر <span>←</span></span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      <Footer />

      <nav className="bottom-bar" aria-label="أزرار سريعة">
        <div className="wrap">
          <button className="btn primary" onClick={() => setModal('offer')}>+ اعرض قطعتك</button>
          <a className="btn wa" href={waLink('السلام عليكم، عايز أستفسر عن أراضي القادسية والأمل.')} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon /> تواصل واتساب
          </a>
        </div>
      </nav>

      {selected && (
        <>
          <div className="scrim" onClick={() => setSelected(null)} />
          <Drawer key={selected.id} item={selected} zone={zones[selected.zone]} onClose={() => setSelected(null)} />
        </>
      )}

      {modal === 'offer' && (
        <ListingWizard mode="public" onClose={() => setModal(null)} onSubmit={submitOffer} />
      )}

      {modal?.type === 'sent' && (
        <div className="modal center" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="sheet narrow done-pop" role="alertdialog" aria-labelledby="sent-title">
            <div className="done-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </div>
            <h3 id="sent-title">تم إرسال الإعلان</h3>
            <p>كود إعلانك <b className="num">{listingCode(modal.id)}</b><br />سيتم مراجعة إعلانك ونشره في أقرب وقت.<br />نتمنى لك التوفيق.</p>
            <button className="btn primary block" onClick={() => setModal(null)} autoFocus>تمام</button>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function Drawer({ item: x, zone, onClose }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const rows = payRows(x);
  const msg = `السلام عليكم، أنا مهتم بالقطعة كود ${listingCode(x.id)}: ${x.zone}، ${areaOf(x)} م²، السعر ${money(x.price)} جنيه.`;
  const geo = zone && [['اللوكيشن', zone.location], ['المحاور', zone.axes], ['الخدمات', zone.services]].filter(([, v]) => v);

  async function buy(e) {
    e.preventDefault();
    const p = normalizePhone(phone);
    if (name.trim().length < 2) return setError('اكتب اسمك.');
    if (!PHONE_RE.test(p)) return setError('اكتب رقم موبايل مصري صح، زي 01012345678.');
    setError(''); setBusy(true);
    const { error: err } = await supabase.rpc('nob_request_purchase', { p_listing_id: x.id, p_name: name.trim(), p_phone: p });
    setBusy(false);
    if (err) return setError(serverError(err, 'مقدرناش نبعت الطلب. جرب تاني.'));
    setSent(true);
  }

  return (
    <aside className="drawer" aria-label="تفاصيل القطعة">
      <div className="body">
        <SheetTop title={<>قطعة في {x.zone} <span className="code num">{listingCode(x.id)}</span></>} onClose={onClose} />
        <div className="money">
          <div className="big"><label>السعر الكلي</label><strong><span className="num">{money(x.price)}</span> ج</strong></div>
          {hasPayment(x) && <div><label>المدفوع</label><strong><span className="num">{money(x.paid)}</span> ج</strong></div>}
          {Number(x.over_amount) > 0 && hasPayment(x) && <div><label>الأوفر</label><strong><span className="num">{money(x.over_amount)}</span> ج</strong></div>}
          {remainingOf(x) > 0 && <div><label>المتبقي (أقساط)</label><strong><span className="num">{money(remainingOf(x))}</span> ج</strong></div>}
        </div>
        <div className="sec-title">بيانات القطعة</div>
        <dl className="kv">
          <dt>المكان</dt><dd>{[SITE.governorate, x.zone, x.district, x.neighborhood].filter(Boolean).join(' · ')}</dd>
          {x.area_orig && Number(x.area_orig) !== areaOf(x) && (<><dt>أصل المساحة</dt><dd><span className="num">{Number(x.area_orig)}</span> م²</dd></>)}
          <dt>{x.area_final ? 'المساحة بعد التقنين' : 'المساحة'}</dt><dd><span className="num">{areaOf(x)}</span> م²</dd>
          {x.land_status && (<><dt>الحالة</dt><dd>{statusLabel(x.land_status)}</dd></>)}
          {x.facade && (<><dt>الواجهة</dt><dd>{x.facade}</dd></>)}
          {x.view_type && (<><dt>الإطلالة</dt><dd>{x.view_type}</dd></>)}
        </dl>
        {rows.length > 0 && (<>
          <div className="sec-title">بنود الدفع</div>
          <div className="paylist">{rows.map(([k, v]) => <div key={k}><label>{k}</label><strong className="num">{v}</strong></div>)}</div>
        </>)}
        {geo && geo.length > 0 && (<>
          <div className="sec-title">مميزات تقسيم {x.zone}</div>
          <div className="geo">{geo.map(([k, v]) => <div key={k}><b>{k}</b><span>{v}</span></div>)}</div>
        </>)}
        {x.description && <div className="desc">{x.description}</div>}
      </div>
      <div className="cta">
        {sent ? (
          <div className="okmsg" role="status">طلب الشراء للقطعة {listingCode(x.id)} وصل. هنكلمك قريب.</div>
        ) : (
          <form className="buyform" onSubmit={buy} noValidate>
            <b>طلب شراء القطعة {listingCode(x.id)}</b>
            <div className="buy-fields">
              <input aria-label="الاسم" placeholder="اسمك" autoComplete="name" maxLength={80} required
                value={name} onChange={(e) => setName(e.target.value)} />
              <input aria-label="رقم التليفون" className="num" type="tel" inputMode="tel" placeholder="رقم التليفون" autoComplete="tel" required
                value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'بيتبعت...' : 'ارسل طلب الشراء'}</button>
          </form>
        )}
        <a className="btn wa block" href={waLink(msg)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon /> تواصل واتساب</a>
      </div>
    </aside>
  );
}
