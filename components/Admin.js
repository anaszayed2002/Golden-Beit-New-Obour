'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  SITE, money, listingCode, userInfo, areaOf, dueOf, remainingOf, payRows, statusLabel,
  parseCode, normalizePhone, toEnglishDigits, waTo, serverError,
} from '@/lib/site';
import { useSession, useToast, useBodyLock } from './hooks';
import AuthModal from './AuthModal';
import ListingWizard from './ListingWizard';

const TABS = [
  { key: 'pending', label: 'مستنية موافقتك' },
  { key: 'approved', label: 'منشورة' },
  { key: 'requests', label: 'طلبات الشراء' },
  { key: 'closed', label: 'مرفوضة ومتباعة' },
  { key: 'customers', label: 'العملاء' },
  { key: 'zones', label: 'الجمعيات' },
];
const STATUS = { pending: 'مستني موافقة', approved: 'منشور', rejected: 'مرفوض', sold: 'اتباعت' };
const tabOf = (x) => (x.status === 'pending' ? 'pending' : x.status === 'approved' ? 'approved' : 'closed');
const fmtDate = (d) => new Date(d).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const uniq = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));

function Phone({ value }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <span className="phone-cell">
      <a className="num" href={`tel:${value}`}>{value}</a>
      <a className="wa-mini" href={waTo(value)} target="_blank" rel="noopener noreferrer">واتساب</a>
    </span>
  );
}

// Matches a free-text query against name/phone, and a code-looking query against the listing id.
function makeMatcher(query) {
  const q = toEnglishDigits(query).trim().toLowerCase();
  if (!q) return () => true;
  const digits = normalizePhone(q);
  const id = /^(gb[-\s]?)?\d{1,6}$/.test(q) ? parseCode(q) : null;
  return (...fields) => fields.some((f) => {
    if (f == null) return false;
    if (typeof f === 'number') return id != null && f === id;
    const s = String(f).toLowerCase();
    return s.includes(q) || (digits.length >= 3 && s.replace(/\D/g, '').includes(digits));
  });
}

export default function Admin() {
  const user = useSession();
  const [isAdmin, setIsAdmin] = useState(undefined);
  const [listings, setListings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [zones, setZones] = useState([]);
  const [tab, setTab] = useState('pending');
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [wizard, setWizard] = useState(null); // {listing?}
  const [busyId, setBusyId] = useState(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    const [l, r, c, z] = await Promise.all([
      supabase.rpc('nob_admin_listings'), supabase.rpc('nob_admin_requests'),
      supabase.rpc('nob_admin_customers'), supabase.from('nob_zones').select('*').order('name'),
    ]);
    if (l.error || r.error || c.error || z.error) return showToast('مقدرناش نحمّل البيانات. جرب تحدّث الصفحة.');
    setListings(l.data); setRequests(r.data); setCustomers(c.data); setZones(z.data);
  }, [showToast]);

  useEffect(() => {
    if (!user) { setIsAdmin(user === null ? false : undefined); return; }
    supabase.rpc('nob_is_admin').then(({ data }) => {
      setIsAdmin(!!data);
      if (data) load();
    });
  }, [user, load]);

  useBodyLock(!!wizard);

  useEffect(() => {
    if (!highlight) return;
    document.getElementById(`card-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight, tab, listings]);

  async function act(fn, args, done) {
    setBusyId(args.p_listing_id ?? args.p_id ?? args.p_request_id ?? null);
    const { error } = await supabase.rpc(fn, args);
    setBusyId(null);
    if (error) return showToast('محصلش. جرب تاني.');
    if (done) showToast(done);
    load();
  }
  const setStatus = (id, status) => act('nob_admin_set_status', { p_listing_id: id, p_status: status }, `${listingCode(id)}: ${STATUS[status]}`);
  const remove = (id) => { setConfirmDelete(null); act('nob_admin_delete_listing', { p_id: id }, `${listingCode(id)} اتمسح`); };
  const setHandled = (id, handled) => act('nob_admin_set_handled', { p_request_id: id, p_handled: handled });

  async function saveListing(payload) {
    const editId = wizard?.listing?.id ?? null;
    const { data, error } = await supabase.rpc('nob_admin_save_listing', { p_id: editId, p: payload });
    if (error) return serverError(error, 'مقدرناش نحفظ الإعلان. جرب تاني.');
    setWizard(null);
    showToast(editId ? `اتحفظت تعديلات ${listingCode(editId)}` : `اتضاف ${listingCode(data)} واتنشر`);
    await load();
    setHighlight(data);
    if (!editId) setTab('approved');
    return '';
  }

  async function saveZone(e, name) {
    e.preventDefault();
    const f = e.currentTarget;
    const { error } = await supabase.rpc('nob_admin_save_zone', {
      p_name: name, p_location: f.location.value, p_axes: f.axes.value, p_services: f.services.value,
    });
    if (error) return showToast('مقدرناش نحفظ. جرب تاني.');
    showToast(`اتحفظت بيانات ${name}`);
    load();
  }

  function search(e) {
    e.preventDefault();
    const q = toEnglishDigits(query).trim();
    if (/^(gb[-\s]?)?\d{1,6}$/i.test(q)) {
      const id = parseCode(q), x = listings.find((l) => l.id === id);
      if (!x) return showToast(`مفيش إعلان بالكود ${listingCode(id)}.`);
      setQuery(''); setTab(tabOf(x)); setHighlight(id); setConfirmDelete(null);
    }
  }

  const me = userInfo(user);
  const match = makeMatcher(query);
  const counts = {
    pending: listings.filter((x) => x.status === 'pending').length,
    approved: listings.filter((x) => x.status === 'approved').length,
    requests: requests.filter((x) => !x.handled).length,
    closed: listings.filter((x) => x.status === 'rejected' || x.status === 'sold').length,
    customers: customers.length,
  };
  const shownListings = listings.filter((x) => tabOf(x) === tab && match(x.id, x.owner_name, x.contact_phone, x.district, x.neighborhood, x.plot_number));
  const shownRequests = requests.filter((r) => match(r.listing_id, r.name, r.phone, r.owner_name, r.contact_phone));
  const shownCustomers = customers.filter((c) => match(c.name, c.phone));

  return (
    <>
      <header className="site-header admin-header">
        <div className="wrap top">
          <a className="brand" href="/admin" aria-label="لوحة الإدارة">
            <img src="/logo.png" alt="جولدن بيت" />
            <span className="sub"><b><span>لوحة الإدارة</span> <span className="sub-small">New Obour</span></b></span>
          </a>
          {isAdmin && <button className="btn primary" onClick={() => setWizard({})}>+ إضافة<span className="long">&nbsp;إعلان</span></button>}
          <a className="btn ghost" href="/">الموقع</a>
          {me && <button className="btn ghost" onClick={() => supabase.auth.signOut()}>خروج</button>}
        </div>
      </header>

      <main className="wrap admin">
        {user === undefined || (user && isAdmin === undefined) ? (
          <div className="state">بنحمّل...</div>
        ) : !user ? (
          <AuthModal inline initialMode="in" why="لوحة الإدارة للمسؤولين بس. لو أول مرة تدخل، اختار &quot;حساب جديد&quot; وسجل برقم الإدارة." onDone={() => {}} />
        ) : !isAdmin ? (
          <div className="state">
            <b>الحساب ده ({me.phone}) مش مسؤول.</b>
            <span>ادخل برقم الإدارة.</span>
            <button className="btn" onClick={() => supabase.auth.signOut()}>خروج</button>
          </div>
        ) : (
          <>
            <form className="adm-search" onSubmit={search} role="search" autoComplete="off">
              <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setHighlight(null); }}
                placeholder="ابحث بالكود أو الاسم أو التليفون" aria-label="بحث" />
              <button className="btn primary" type="submit">بحث</button>
            </form>

            <div className="admin-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setConfirmDelete(null); }}>
                  {t.label}{counts[t.key] > 0 && <span className="badge num">{counts[t.key]}</span>}
                </button>
              ))}
              <button className="btn refresh" onClick={load}>تحديث</button>
            </div>

            {(tab === 'pending' || tab === 'approved' || tab === 'closed') && (
              shownListings.length === 0 ? (
                <div className="state">{query ? 'مفيش نتايج للبحث ده هنا.' : tab === 'pending' ? 'مفيش إعلانات مستنية موافقة.' : 'مفيش إعلانات هنا.'}</div>
              ) : (
                <div className="alist">
                  {shownListings.map((x) => (
                    <ListingCard key={x.id} x={x} highlight={highlight === x.id} busy={busyId === x.id}
                      confirming={confirmDelete === x.id}
                      onStatus={(s) => setStatus(x.id, s)} onEdit={() => setWizard({ listing: x })}
                      onAskDelete={() => setConfirmDelete(x.id)} onCancelDelete={() => setConfirmDelete(null)}
                      onDelete={() => remove(x.id)} />
                  ))}
                </div>
              )
            )}

            {tab === 'requests' && (
              shownRequests.length === 0 ? <div className="state">{query ? 'مفيش نتايج للبحث ده.' : 'مفيش طلبات شراء لسه.'}</div> : (
                <div className="alist">
                  {shownRequests.map((r) => (
                    <article key={r.id} className={`aitem${r.handled ? ' done' : ''}`}>
                      <div className="ahead">
                        <b>{r.name}</b>
                        <span className="muted">طالب <span className="num">{listingCode(r.listing_id)}</span> · {fmtDate(r.created_at)}</span>
                      </div>
                      <dl className="akv">
                        <dt>تليفونه</dt><dd><Phone value={r.phone} /></dd>
                        <dt>القطعة</dt><dd>{[r.zone, r.district].filter(Boolean).join(' · ')} · <span className="num">{Number(r.area)}</span> م² · <span className="num">{money(r.price)}</span> ج</dd>
                        <dt>البلوك / القطعة</dt><dd className="num">{r.block || '—'} / {r.plot_number || 'لسه متخصصتش'}</dd>
                        <dt>صاحب القطعة</dt><dd>{r.owner_name || '—'}</dd>
                        <dt>تليفون صاحبها</dt><dd><Phone value={r.contact_phone} /></dd>
                      </dl>
                      <div className="aacts">
                        <button className={`btn sm ${r.handled ? '' : 'primary'}`} onClick={() => setHandled(r.id, !r.handled)}>
                          {r.handled ? 'رجّعه مش متتابع' : 'اتتابع'}
                        </button>
                        <button className="btn sm" onClick={() => {
                          const x = listings.find((l) => l.id === r.listing_id);
                          if (x) { setQuery(''); setTab(tabOf(x)); setHighlight(x.id); }
                        }}>افتح القطعة</button>
                      </div>
                    </article>
                  ))}
                </div>
              )
            )}

            {tab === 'customers' && (
              shownCustomers.length === 0 ? <div className="state">{query ? 'مفيش عميل بالاسم أو الرقم ده.' : 'مفيش عملاء لسه.'}</div> : (
                <>
                  <p className="muted tab-note">كل اللي عرض قطعة أو طلب قطعة، بالاسم ورقم التليفون.</p>
                  <div className="tablebox cust-table"><table>
                    <thead><tr><th>الاسم</th><th>رقم التليفون</th><th>عرض قطع</th><th>طلب قطع</th><th>آخر مرة</th></tr></thead>
                    <tbody>
                      {shownCustomers.map((c) => (
                        <tr key={c.phone} className="static">
                          <td className="zone">{c.name}</td>
                          <td><Phone value={c.phone} /></td>
                          <td className="num">{c.offers}</td>
                          <td className="num">{c.requests}</td>
                          <td className="muted">{fmtDate(c.last_seen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                  <div className="cust-rows">
                    {shownCustomers.map((c) => (
                      <div key={c.phone} className="cust-row">
                        <div className="cust-top"><b>{c.name}</b><span className="muted">{fmtDate(c.last_seen)}</span></div>
                        <Phone value={c.phone} />
                        <div className="muted cust-stats">
                          <span>عرض قطع <b className="num">{c.offers}</b></span>
                          <span>طلب قطع <b className="num">{c.requests}</b></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            )}

            {tab === 'zones' && (
              <>
                <p className="muted tab-note">الكلام ده بيظهر مع كل قطعة في الجمعية، تحت &quot;مميزات التقسيم&quot;.</p>
                <div className="zones">
                  {zones.map((z) => (
                    <form key={z.name} className="zcard" onSubmit={(e) => saveZone(e, z.name)}>
                      <h3>{z.name}</h3>
                      <div className="field"><label htmlFor={`z-loc-${z.name}`}>اللوكيشن</label>
                        <textarea id={`z-loc-${z.name}`} name="location" maxLength={1000} defaultValue={z.location} /></div>
                      <div className="field"><label htmlFor={`z-axes-${z.name}`}>المحاور</label>
                        <textarea id={`z-axes-${z.name}`} name="axes" maxLength={1000} defaultValue={z.axes} /></div>
                      <div className="field"><label htmlFor={`z-svc-${z.name}`}>الخدمات</label>
                        <textarea id={`z-svc-${z.name}`} name="services" maxLength={1000} defaultValue={z.services} /></div>
                      <button className="btn primary" type="submit">حفظ {z.name}</button>
                    </form>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {wizard && (
        <ListingWizard mode="admin" initial={wizard.listing} editId={wizard.listing?.id}
          onClose={() => setWizard(null)} onSubmit={saveListing}
          suggestions={{ districts: uniq(listings.map((x) => x.district)), neighborhoods: uniq(listings.map((x) => x.neighborhood)) }} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function ListingCard({ x, highlight, busy, confirming, onStatus, onEdit, onAskDelete, onCancelDelete, onDelete }) {
  const rows = payRows(x);
  return (
    <article id={`card-${x.id}`} className={`aitem${highlight ? ' hl' : ''}`}>
      <div className="ahead">
        <b>{[x.zone, x.district, x.neighborhood].filter(Boolean).join(' · ')}</b>
        <span className="muted"><span className="num">{listingCode(x.id)}</span> · {fmtDate(x.created_at)}</span>
        <span className={`pill st-${x.status}`}>{STATUS[x.status]}</span>
      </div>
      <dl className="private">
        <dt>صاحب الإعلان</dt><dd>{x.owner_name || '—'}</dd>
        <dt>التليفون</dt><dd><Phone value={x.contact_phone} /></dd>
        <dt>البلوك</dt><dd className="num">{x.block || '—'}</dd>
        <dt>رقم القطعة</dt><dd className="num">{x.plot_number || 'لسه متخصصتش'}</dd>
      </dl>
      <div className="amoney">
        <div><label>السعر الكلي</label><strong className="num">{money(x.price)}</strong></div>
        <div><label>المدفوع</label><strong className="num paid">{money(x.paid)}</strong></div>
        <div><label>المطلوب دفعه</label><strong className="num">{money(dueOf(x))}</strong></div>
        <div><label>المتبقي</label><strong className="num rem">{money(remainingOf(x))}</strong></div>
      </div>
      <dl className="akv">
        <dt>المساحة</dt><dd>
          {x.area_orig && Number(x.area_orig) !== areaOf(x)
            ? <><span className="num">{Number(x.area_orig)}</span> ← <span className="num">{areaOf(x)}</span> م² بعد التقنين</>
            : <><span className="num">{areaOf(x)}</span> م²</>}
        </dd>
        <dt>الحالة</dt><dd>{statusLabel(x.land_status) || <span className="muted">مش متحددة</span>}</dd>
        {(x.facade || x.view_type) && (<><dt>الواجهة / الإطلالة</dt><dd>{x.facade || '—'} / {x.view_type || '—'}</dd></>)}
        {rows.length > 0 && (<><dt>بنود الدفع</dt><dd>{rows.map(([k, v]) => `${k}: ${v}`).join(' · ')}</dd></>)}
        {x.description && (<><dt>الوصف</dt><dd className="pre">{x.description}</dd></>)}
        {Number(x.request_count) > 0 && (<><dt>طلبات عليها</dt><dd className="num">{x.request_count}</dd></>)}
      </dl>
      {x.notes && (
        <details className="notes">
          <summary>ملاحظات الإدارة</summary>
          <p className="pre">{x.notes}</p>
        </details>
      )}
      {confirming ? (
        <div className="confirm">
          متأكد إنك عايز تمسح {listingCode(x.id)} نهائي؟
          <button className="btn sm solid-danger" disabled={busy} onClick={onDelete}>أيوه امسح</button>
          <button className="btn sm" onClick={onCancelDelete}>لا</button>
        </div>
      ) : (
        <div className="aacts">
          {x.status === 'pending' && (<>
            <button className="btn sm primary" disabled={busy} onClick={() => onStatus('approved')}>موافقة ونشر</button>
            <button className="btn sm danger" disabled={busy} onClick={() => onStatus('rejected')}>رفض</button>
          </>)}
          {x.status === 'approved' && (<>
            <button className="btn sm" disabled={busy} onClick={() => onStatus('sold')}>اتباعت</button>
            <button className="btn sm danger" disabled={busy} onClick={() => onStatus('rejected')}>إخفاء</button>
          </>)}
          {(x.status === 'rejected' || x.status === 'sold') && (
            <button className="btn sm primary" disabled={busy} onClick={() => onStatus('approved')}>إعادة نشر</button>
          )}
          <button className="btn sm" onClick={onEdit}>تعديل</button>
          <button className="btn sm danger" onClick={onAskDelete}>مسح</button>
        </div>
      )}
    </article>
  );
}
