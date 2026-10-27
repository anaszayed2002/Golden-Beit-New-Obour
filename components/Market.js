'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SITE, money, listingCode, waLink, userInfo, PHONE_RE, normalizePhone } from '@/lib/site';
import { useSession, useToast, useBodyLock, useEscape } from './hooks';
import AuthModal from './AuthModal';
import SheetTop from './SheetTop';
import Footer from './Footer';
import { WhatsAppIcon } from './icons';

const EMPTY_FILTERS = { zone: '', ownership: '', pmin: '', pmax: '', amin: '', amax: '', rmax: '', ready: false };
const SORTS = {
  '': (a, b) => new Date(b.created_at) - new Date(a.created_at),
  'price:1': (a, b) => a.price - b.price,
  'price:-1': (a, b) => b.price - a.price,
  'area:-1': (a, b) => b.area - a.area,
  'rem:1': (a, b) => a.remaining - b.remaining,
};

function applyFilters(list, f) {
  const n = (v, d) => (v === '' ? d : Number(v));
  return list.filter((x) =>
    (!f.zone || x.zone === f.zone) &&
    (!f.ownership || x.ownership === f.ownership) &&
    x.price >= n(f.pmin, 0) && x.price <= n(f.pmax, Infinity) &&
    x.area >= n(f.amin, 0) && x.area <= n(f.amax, Infinity) &&
    x.remaining <= n(f.rmax, Infinity) &&
    (!f.ready || x.ready));
}

const activeCount = (f) => Object.entries(f).filter(([, v]) => v !== '' && v !== false).length;

export default function Market() {
  const user = useSession();
  const me = userInfo(user);
  const [listings, setListings] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null); // {type:'auth', why, then} | {type:'offer'}
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('nob_listings')
      .select('id,zone,area,price,paid,remaining,ownership,ready,description,created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (error) { setLoadError(true); setListings([]); return; }
    setLoadError(false);
    setListings(data.map((x) => ({ ...x, area: Number(x.area) })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const all = listings || [];
  const visible = useMemo(() => applyFilters(all, filters).sort(SORTS[sort]), [all, filters, sort]);
  const nActive = activeCount(filters);
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  useBodyLock(!!selected || !!modal || filtersOpen);
  useEscape(useCallback(() => {
    if (modal) setModal(null); else if (filtersOpen) setFiltersOpen(false); else setSelected(null);
  }, [modal, filtersOpen]));

  function requireUser(why, then) {
    if (user) return then(user);
    setFiltersOpen(false);
    setModal({ type: 'auth', why, then });
  }

  async function requestPlot(item, u) {
    const { error } = await supabase.rpc('nob_request_plot', { p_listing_id: item.id });
    if (error) return showToast('مقدرناش نبعت الطلب. جرب تاني.');
    setSelected(null);
    showToast(`طلبك للقطعة ${listingCode(item.id)} وصل. هنكلمك على ${userInfo(u).phone}`);
  }

  async function signOut() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    showToast('اتسجل خروجك');
  }

  return (
    <>
      <header className="site-header">
        <div className="wrap top">
          <a className="brand" href="/" aria-label={SITE.name}>
            <img src="/logo.png" alt="جولدن بيت Golden Beit" />
            <span className="sub"><b><span>Golden Beit</span> <span>New Obour</span></b><small>القادسية · الأمل</small></span>
          </a>
          <button className="btn primary" onClick={() => requireUser('علشان تعرض قطعتك لازم تسجل حساب الأول.', () => setModal({ type: 'offer' }))}>
            + اعرض<span className="long">&nbsp;قطعتك</span>
          </button>
          {user === undefined ? null : me ? (
            <div className="me">
              <button onClick={() => setMenuOpen((o) => !o)} aria-haspopup="true" aria-expanded={menuOpen}>
                <span className="avatar">{(me.name.trim()[0] || '؟')}</span><span className="name">{me.name}</span>
              </button>
              {menuOpen && (
                <div className="menu">
                  <div>{me.name}<br /><span className="num">{me.phone}</span></div>
                  <button onClick={() => { setMenuOpen(false); setModal({ type: 'mine' }); }}>إعلاناتي</button>
                  <button onClick={signOut}>تسجيل خروج</button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn ghost" onClick={() => setModal({ type: 'auth', mode: 'in' })}>دخول</button>
          )}
        </div>
      </header>

      <main className="wrap market">
        <div className="stats">
          <button className="stat" aria-pressed={nActive === 0} onClick={() => setFilters(EMPTY_FILTERS)}>
            <span>قطع معروضة</span><strong className="num">{all.length}</strong>
          </button>
          <button className="stat" aria-pressed={filters.ready} onClick={() => set('ready', !filters.ready)}>
            <span>جاهز للتسليم</span><strong className="num">{all.filter((x) => x.ready).length}</strong>
          </button>
          {SITE.zones.map((z) => (
            <button key={z} className="stat" aria-pressed={filters.zone === z} onClick={() => set('zone', filters.zone === z ? '' : z)}>
              <span>في {z}</span><strong className="num">{all.filter((x) => x.zone === z).length}</strong>
            </button>
          ))}
        </div>

        <div className="toolbar">
          <h2>القطع المعروضة <small><span className="num">{visible.length}</span> قطعة</small></h2>
          <button className="btn" id="filter-btn" onClick={() => setFiltersOpen(true)}>
            الفلتر {nActive > 0 && <span className="fcount num">{nActive}</span>}
          </button>
          <select className="sortsel" aria-label="ترتيب" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="">الأحدث</option>
            <option value="price:1">السعر: الأقل الأول</option>
            <option value="price:-1">السعر: الأعلى الأول</option>
            <option value="area:-1">المساحة: الأكبر الأول</option>
            <option value="rem:1">المتبقي: الأقل الأول</option>
          </select>
        </div>

        {filtersOpen && <div className="scrim filters-scrim" onClick={() => setFiltersOpen(false)} />}
        <div className={`filters${filtersOpen ? ' open' : ''}`} role="search">
          <div className="sheet-hd"><h3>الفلتر</h3><button className="x" aria-label="إغلاق" onClick={() => setFiltersOpen(false)}>✕</button></div>
          <div className="f"><label htmlFor="fz">المنطقة</label>
            <select id="fz" value={filters.zone} onChange={(e) => set('zone', e.target.value)}>
              <option value="">الكل</option>{SITE.zones.map((z) => <option key={z}>{z}</option>)}
            </select></div>
          <div className="f"><label>السعر الإجمالي (جنيه)</label>
            <div className="pair">
              <input type="number" inputMode="numeric" placeholder="من" aria-label="السعر من" value={filters.pmin} onChange={(e) => set('pmin', e.target.value)} />
              <input type="number" inputMode="numeric" placeholder="إلى" aria-label="السعر إلى" value={filters.pmax} onChange={(e) => set('pmax', e.target.value)} />
            </div></div>
          <div className="f"><label>المساحة (م²)</label>
            <div className="pair">
              <input type="number" inputMode="numeric" placeholder="من" aria-label="المساحة من" value={filters.amin} onChange={(e) => set('amin', e.target.value)} />
              <input type="number" inputMode="numeric" placeholder="إلى" aria-label="المساحة إلى" value={filters.amax} onChange={(e) => set('amax', e.target.value)} />
            </div></div>
          <div className="f"><label htmlFor="frmax">المتبقي لحد (جنيه)</label>
            <input id="frmax" type="number" inputMode="numeric" placeholder="أقصى مبلغ" value={filters.rmax} onChange={(e) => set('rmax', e.target.value)} /></div>
          <div className="f"><label htmlFor="fo">الملكية</label>
            <select id="fo" value={filters.ownership} onChange={(e) => set('ownership', e.target.value)}>
              <option value="">الكل</option>{SITE.ownership.map((o) => <option key={o}>{o}</option>)}
            </select></div>
          <label className="chk"><input type="checkbox" checked={filters.ready} onChange={(e) => set('ready', e.target.checked)} /> جاهز للتسليم</label>
          <div className="factions">
            <button className="btn" onClick={() => setFilters(EMPTY_FILTERS)}>مسح الفلتر</button>
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
            <div className="tablebox"><table>
              <thead><tr>
                <th>المنطقة</th><th>المساحة</th><th>السعر الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الملكية</th><th>التسليم</th>
                <th><span className="sr-only">التفاصيل</span></th>
              </tr></thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={8} className="empty">مفيش قطع بالمواصفات دي. جرّب توسّع الفلتر.</td></tr>}
                {visible.map((x) => (
                  <tr key={x.id} tabIndex={0} className={selected?.id === x.id ? 'sel' : ''}
                    onClick={() => setSelected(x)} onKeyDown={(e) => e.key === 'Enter' && setSelected(x)}>
                    <td className="zone">{x.zone}</td>
                    <td><span className="num">{x.area}</span> م²</td>
                    <td className="price"><span className="num">{money(x.price)}</span><span className="cur">ج</span></td>
                    <td>
                      <div className="paid"><span className="num">{money(x.paid)}</span><span className="cur">ج</span></div>
                      <div className="bar"><span style={{ width: `${Math.min(100, Math.round((x.paid / x.price) * 100))}%` }} /></div>
                    </td>
                    <td className="rem"><span className="num">{money(x.remaining)}</span><span className="cur">ج</span></td>
                    <td><span className="pill own">{x.ownership}</span></td>
                    <td>{x.ready ? <span className="pill ready">جاهز للتسليم</span> : <span className="pill">لسه</span>}</td>
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
                  <div className="l1">
                    <span className="zone">{x.zone}</span>
                    <span className="area"><span className="num">{x.area}</span> م²</span>
                    <span className="tags"><span className="pill own">{x.ownership}</span>{x.ready && <span className="pill ready">جاهز</span>}</span>
                  </div>
                  <div className="l2"><span className="num">{money(x.price)}</span> <span className="cur">جنيه</span></div>
                  <div className="l3">
                    <span>المدفوع <b className="paid num">{money(x.paid)}</b></span>
                    <span>المتبقي <b className="rem num">{money(x.remaining)}</b></span>
                  </div>
                  <span className="btn more block" aria-hidden="true">تفاصيل أكثر <span>←</span></span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      <Footer />

      {selected && (
        <>
          <div className="scrim" onClick={() => setSelected(null)} />
          <Drawer item={selected} onClose={() => setSelected(null)}
            onOrder={() => requireUser('علشان تطلب القطعة لازم يكون عندك حساب باسمك ورقم تليفونك.', (u) => requestPlot(selected, u))} />
        </>
      )}

      {modal?.type === 'auth' && (
        <AuthModal initialMode={modal.mode || 'reg'} why={modal.why} onClose={() => setModal(null)}
          onDone={(u) => {
            const then = modal.then;
            setModal(null);
            if (then) then(u); else showToast(`أهلاً ${userInfo(u).name}`);
          }} />
      )}

      {modal?.type === 'offer' && me && (
        <OfferForm me={me} onClose={() => setModal(null)}
          onDone={() => setModal({ type: 'sent' })} />
      )}

      {modal?.type === 'sent' && (
        <div className="modal center" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="sheet narrow done-pop" role="alertdialog" aria-labelledby="sent-title">
            <div className="done-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </div>
            <h3 id="sent-title">تم إرسال الإعلان</h3>
            <p>سيتم مراجعة إعلانك ونشره في أقرب وقت.<br />نتمنى لك التوفيق.</p>
            <button className="btn primary block" onClick={() => setModal(null)} autoFocus>تمام</button>
            <button className="btn block" onClick={() => setModal({ type: 'mine' })}>تابع إعلاناتي</button>
          </div>
        </div>
      )}

      {modal?.type === 'mine' && me && (
        <MyListings onClose={() => setModal(null)} onNew={() => setModal({ type: 'offer' })} />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

const MY_STATUS = {
  pending: { label: 'مستني المراجعة', note: 'الإدارة هتراجع إعلانك وتنشره في أقرب وقت.' },
  approved: { label: 'اتنشر', note: 'إعلانك ظاهر دلوقتي في الصفحة.' },
  rejected: { label: 'اترفض', note: 'لو عندك استفسار عن سبب الرفض كلمنا على واتساب.' },
  sold: { label: 'اتباعت', note: 'القطعة اتشالت من الصفحة علشان اتباعت.' },
};

function MyListings({ onClose, onNew }) {
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    supabase.rpc('nob_my_listings').then(({ data, error }) => {
      if (error) { setFailed(true); setItems([]); } else setItems(data);
    });
  }, []);

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet has-top mine" role="dialog" aria-label="إعلاناتي">
        <SheetTop title="إعلاناتي" onClose={onClose} />
        {items === null ? (
          <p className="muted">بنحمّل إعلاناتك...</p>
        ) : failed ? (
          <p className="form-error">مقدرناش نحمّل إعلاناتك. جرب تاني بعد شوية.</p>
        ) : items.length === 0 ? (
          <div className="mine-empty">
            <p>لسه معرضتش أي قطعة.</p>
            <button className="btn primary" onClick={onNew}>+ اعرض قطعتك</button>
          </div>
        ) : (
          <div className="mine-list">
            {items.map((x) => {
              const st = MY_STATUS[x.status] || MY_STATUS.pending;
              return (
                <article key={x.id} className={`mine-item st-${x.status}-edge`}>
                  <div className="mine-head">
                    <b>{x.zone} · <span className="num">{Number(x.area)}</span> م²</b>
                    <span className={`pill st-${x.status}`}>{st.label}</span>
                  </div>
                  <div className="mine-meta muted">
                    <span>كود <span className="num">{listingCode(x.id)}</span></span>
                    {x.plot_number && <span>قطعة <span className="num">{x.plot_number}</span></span>}
                    <span>اتبعت {new Date(x.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <div className="mine-money">
                    <span>الإجمالي <b className="num">{money(x.price)}</b></span>
                    <span>المدفوع <b className="num paid">{money(x.paid)}</b></span>
                    <span>المتبقي <b className="num rem">{money(x.remaining)}</b></span>
                  </div>
                  <p className="mine-note">
                    {st.note}
                    {x.status === 'rejected' && (
                      <> <a href={waLink(`بخصوص إعلاني كود ${listingCode(x.id)}`)} target="_blank" rel="noopener noreferrer">كلمنا على واتساب</a></>
                    )}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Drawer({ item: x, onClose, onOrder }) {
  const msg = `السلام عليكم، أنا مهتم بالقطعة كود ${listingCode(x.id)}: ${x.zone}، ${x.area} م²، السعر ${money(x.price)} جنيه.`;
  return (
    <aside className="drawer" aria-label="تفاصيل القطعة">
      <div className="body">
        <div className="hd">
          <div><h3>قطعة في {x.zone}</h3><div className="code">كود الإعلان <span className="num">{listingCode(x.id)}</span></div></div>
          <button className="x" aria-label="إغلاق" onClick={onClose} autoFocus>✕</button>
        </div>
        <div className="money">
          <div><label>السعر الإجمالي</label><strong><span className="num">{money(x.price)}</span> ج</strong></div>
          <div><label>المدفوع</label><strong><span className="num">{money(x.paid)}</span> ج</strong></div>
          <div><label>المتبقي</label><strong><span className="num">{money(x.remaining)}</span> ج</strong></div>
        </div>
        <dl className="kv">
          <dt>المساحة</dt><dd><span className="num">{x.area}</span> م²</dd>
          <dt>الملكية</dt><dd>{x.ownership}</dd>
          <dt>جاهز للتسليم</dt><dd>{x.ready ? 'نعم' : 'لا'}</dd>
        </dl>
        {x.description && <div className="desc">{x.description}</div>}
      </div>
      <div className="cta">
        <a className="btn wa block" href={waLink(msg)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon /> تواصل واتساب</a>
        <button className="btn primary block" onClick={onOrder}>اطلب القطعة</button>
      </div>
    </aside>
  );
}

function OfferForm({ me, onClose, onDone }) {
  const [f, setF] = useState({
    zone: SITE.zones[0], plot: '', area: '', ownership: SITE.ownership[0], ready: false,
    price: '', paid: '', remaining: '', phone: '', desc: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    const phone = normalizePhone(f.phone);
    const area = Number(f.area), price = Number(f.price), paid = Number(f.paid || 0), remaining = Number(f.remaining || 0);
    if (!(area > 0)) return setError('اكتب المساحة بالمتر.');
    if (!(price > 0)) return setError('اكتب السعر الإجمالي.');
    if (paid < 0 || remaining < 0) return setError('المدفوع والمتبقي لازم يكونوا أرقام موجبة.');
    if (paid > price) return setError('المدفوع أكبر من السعر الإجمالي. راجع الأرقام.');
    if (!phone) return setError('اكتب رقم تليفونك.');
    if (!PHONE_RE.test(phone)) return setError('اكتب رقم تليفون مصري صح، زي 01012345678.');
    setBusy(true);
    const { error } = await supabase.rpc('nob_submit_listing', {
      p_zone: f.zone, p_plot_number: f.plot, p_area: area, p_ownership: f.ownership, p_ready: f.ready,
      p_price: Math.round(price), p_paid: Math.round(paid), p_remaining: Math.round(remaining),
      p_contact_phone: phone, p_description: f.desc,
    });
    setBusy(false);
    if (error) {
      return setError(error.message?.includes('too_many_pending')
        ? 'عندك إعلانات كتير مستنية المراجعة. استنى لما الإدارة تراجعها.'
        : 'مقدرناش نبعت الإعلان. جرب تاني.');
    }
    onDone();
  }

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet has-top" onSubmit={submit} noValidate>
        <SheetTop title="اعرض قطعتك" onClose={onClose} />
        <p className="sub">الإعلان هيوصل لإدارة جولدن بيت الأول، وبعد الموافقة هينزل في الصفحة.</p>
        <div className="grid">
          <div className="field"><label htmlFor="i-zone">المنطقة</label>
            <select id="i-zone" value={f.zone} onChange={(e) => set('zone', e.target.value)}>
              {SITE.zones.map((z) => <option key={z}>{z}</option>)}
            </select></div>
          <div className="field"><label htmlFor="i-plot">رقم القطعة (لو موجود)</label>
            <input id="i-plot" maxLength={40} placeholder="سيبه فاضي لو لسه متخصصتش" value={f.plot} onChange={(e) => set('plot', e.target.value)} /></div>
          <div className="field"><label htmlFor="i-area">المساحة (م²)</label>
            <input id="i-area" type="number" inputMode="decimal" min="1" value={f.area} onChange={(e) => set('area', e.target.value)} /></div>
          <div className="field"><label>نوع الملكية</label>
            <div className="radios">
              {SITE.ownership.map((o) => (
                <label key={o}><input type="radio" name="own" checked={f.ownership === o} onChange={() => set('ownership', o)} /> {o}</label>
              ))}
            </div></div>
          <div className="field full"><label className="chk fit"><input type="checkbox" checked={f.ready} onChange={(e) => set('ready', e.target.checked)} /> جاهز للتسليم</label></div>
          <div className="field"><label htmlFor="i-price">السعر الإجمالي (جنيه)</label>
            <input id="i-price" type="number" inputMode="numeric" min="1" value={f.price} onChange={(e) => set('price', e.target.value)} />
            {f.price && <small className="hint num">{money(f.price)} ج</small>}</div>
          <div className="field"><label htmlFor="i-paid">المدفوع (جنيه)</label>
            <input id="i-paid" type="number" inputMode="numeric" min="0" value={f.paid} onChange={(e) => set('paid', e.target.value)} />
            {f.paid && <small className="hint num">{money(f.paid)} ج</small>}</div>
          <div className="field"><label htmlFor="i-rem">المتبقي (جنيه)</label>
            <input id="i-rem" type="number" inputMode="numeric" min="0" value={f.remaining}
              onChange={(e) => set('remaining', e.target.value)} />
            {f.remaining && <small className="hint num">{money(f.remaining)} ج</small>}</div>
          <div className="field"><label htmlFor="i-phone">رقم تليفونك</label>
            <input id="i-phone" className="num" type="tel" inputMode="tel" autoComplete="off" placeholder="01xxxxxxxxx" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="field full"><label htmlFor="i-desc">الوصف</label>
            <textarea id="i-desc" maxLength={2000} placeholder="اكتب أي تفاصيل: الاتجاه، الشارع، الأقساط، ميعاد التسليم..."
              value={f.desc} onChange={(e) => set('desc', e.target.value)} /></div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'بيتبعت...' : 'ابعت للمراجعة'}</button>
          <button type="button" className="btn" onClick={onClose}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}
