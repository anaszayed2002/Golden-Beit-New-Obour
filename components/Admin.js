'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SITE, money, listingCode, userInfo } from '@/lib/site';
import { useSession, useToast } from './hooks';
import AuthModal from './AuthModal';

const TABS = [
  { key: 'pending', label: 'مستنية موافقتك' },
  { key: 'approved', label: 'منشورة' },
  { key: 'requests', label: 'طلبات القطع' },
  { key: 'closed', label: 'مرفوضة ومتباعة' },
  { key: 'customers', label: 'العملاء' },
];
const STATUS = { pending: 'مستني موافقة', approved: 'منشور', rejected: 'مرفوض', sold: 'اتباعت' };

const fmtDate = (d) => new Date(d).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const waTo = (phone) => `https://wa.me/2${phone}`;
// Lets the customer search match Arabic-Indic digits and "+20"/"0020" prefixes typed into the box.
const normalizeQuery = (s) => {
  const t = String(s || '').trim().toLowerCase()
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  return /^[+\d\s-]+$/.test(t) ? t.replace(/\D/g, '').replace(/^(00)?20(?=1)/, '0') : t;
};

function Phone({ value }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <span className="phone-cell">
      <a className="num" href={`tel:${value}`}>{value}</a>
      <a className="wa-mini" href={waTo(value)} target="_blank" rel="noopener noreferrer">واتساب</a>
    </span>
  );
}

export default function Admin() {
  const user = useSession();
  const [isAdmin, setIsAdmin] = useState(undefined);
  const [listings, setListings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    const [l, r, c] = await Promise.all([
      supabase.rpc('nob_admin_listings'), supabase.rpc('nob_admin_requests'), supabase.rpc('nob_admin_customers'),
    ]);
    if (l.error || r.error || c.error) return showToast('مقدرناش نحمّل البيانات. جرب تحدّث الصفحة.');
    setListings(l.data);
    setRequests(r.data);
    setCustomers(c.data);
  }, [showToast]);

  useEffect(() => {
    if (!user) { setIsAdmin(user === null ? false : undefined); return; }
    supabase.rpc('nob_is_admin').then(({ data }) => {
      setIsAdmin(!!data);
      if (data) load();
    });
  }, [user, load]);

  async function setStatus(id, status) {
    setBusyId(id);
    const { error } = await supabase.rpc('nob_admin_set_status', { p_listing_id: id, p_status: status });
    setBusyId(null);
    if (error) return showToast('محصلش. جرب تاني.');
    showToast(`${listingCode(id)}: ${STATUS[status]}`);
    load();
  }

  async function setHandled(id, handled) {
    const { error } = await supabase.rpc('nob_admin_set_handled', { p_request_id: id, p_handled: handled });
    if (error) return showToast('محصلش. جرب تاني.');
    load();
  }

  const me = userInfo(user);
  const counts = {
    pending: listings.filter((x) => x.status === 'pending').length,
    approved: listings.filter((x) => x.status === 'approved').length,
    requests: requests.filter((x) => !x.handled).length,
    closed: listings.filter((x) => x.status === 'rejected' || x.status === 'sold').length,
    customers: customers.length,
  };
  const q = normalizeQuery(query);
  const shownCustomers = q
    ? customers.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
    : customers;
  const shown = tab === 'closed'
    ? listings.filter((x) => x.status === 'rejected' || x.status === 'sold')
    : listings.filter((x) => x.status === tab);

  return (
    <>
      <header className="site-header">
        <div className="wrap top">
          <a className="brand" href="/admin" aria-label="لوحة الإدارة">
            <img src="/logo.png" alt="جولدن بيت" />
            <span className="sub"><b>لوحة الإدارة</b><small>{SITE.name}</small></span>
          </a>
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
            <div className="admin-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                  {t.label}{counts[t.key] > 0 && <span className="badge num">{counts[t.key]}</span>}
                </button>
              ))}
              <button className="btn refresh" onClick={load}>تحديث</button>
            </div>

            {tab === 'customers' ? (
              <section className="customers">
                <div className="cust-tools">
                  <input type="search" className="cust-search" placeholder="ابحث بالاسم أو رقم التليفون" aria-label="بحث في العملاء"
                    value={query} onChange={(e) => setQuery(e.target.value)} />
                  <span className="muted"><span className="num">{shownCustomers.length}</span> عميل</span>
                </div>
                {shownCustomers.length === 0 ? (
                  <div className="state">{customers.length === 0 ? 'مفيش عملاء على المنصة دي لسه.' : 'مفيش عميل بالاسم أو الرقم ده.'}</div>
                ) : (
                  <>
                    <div className="tablebox cust-table"><table>
                      <thead><tr><th>الاسم</th><th>رقم التليفون</th><th>تاريخ التسجيل</th><th>إعلانات</th><th>طلبات قطع</th></tr></thead>
                      <tbody>
                        {shownCustomers.map((c) => (
                          <tr key={c.id} className="static">
                            <td className="zone">{c.name || <span className="muted">بدون اسم</span>}</td>
                            <td><Phone value={c.phone} /></td>
                            <td className="muted">{fmtDate(c.created_at)}</td>
                            <td className="num">{c.listing_count}</td>
                            <td className="num">{c.request_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                    <div className="cust-rows">
                      {shownCustomers.map((c) => (
                        <div key={c.id} className="cust-row">
                          <div className="cust-top"><b>{c.name || 'بدون اسم'}</b><span className="muted">{fmtDate(c.created_at)}</span></div>
                          <Phone value={c.phone} />
                          <div className="muted cust-stats">
                            <span>إعلانات <b className="num">{c.listing_count}</b></span>
                            <span>طلبات قطع <b className="num">{c.request_count}</b></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            ) : tab === 'requests' ? (
              requests.length === 0 ? <div className="state">مفيش طلبات لسه.</div> : (
                <div className="alist">
                  {requests.map((r) => (
                    <article key={r.id} className={`aitem${r.handled ? ' done' : ''}`}>
                      <div className="ahead">
                        <b>{r.name || 'بدون اسم'}</b>
                        <span className="muted">طالب القطعة <span className="num">{listingCode(r.listing_id)}</span> · {fmtDate(r.created_at)}</span>
                      </div>
                      <dl className="akv">
                        <dt>تليفون الطالب</dt><dd><Phone value={r.phone} /></dd>
                        <dt>القطعة</dt><dd>{r.zone} · <span className="num">{Number(r.area)}</span> م² · <span className="num">{money(r.price)}</span> ج</dd>
                        <dt>رقم القطعة</dt><dd className="num">{r.plot_number || 'لسه متخصصتش'}</dd>
                        <dt>صاحب القطعة</dt><dd>{r.owner_name}</dd>
                        <dt>تليفون صاحبها</dt><dd><Phone value={r.contact_phone} /></dd>
                      </dl>
                      <div className="aacts">
                        <button className={`btn ${r.handled ? '' : 'primary'}`} onClick={() => setHandled(r.id, !r.handled)}>
                          {r.handled ? 'رجّعه مش متتابع' : 'اتتابع'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )
            ) : shown.length === 0 ? (
              <div className="state">{tab === 'pending' ? 'مفيش إعلانات مستنية موافقة.' : 'مفيش إعلانات هنا.'}</div>
            ) : (
              <div className="alist">
                {shown.map((x) => (
                  <article key={x.id} className="aitem">
                    <div className="ahead">
                      <b>{x.zone} · <span className="num">{Number(x.area)}</span> م²</b>
                      <span className="muted"><span className="num">{listingCode(x.id)}</span> · {fmtDate(x.created_at)}</span>
                      <span className={`pill st-${x.status}`}>{STATUS[x.status]}</span>
                    </div>
                    <div className="amoney">
                      <div><label>الإجمالي</label><strong className="num">{money(x.price)}</strong></div>
                      <div><label>المدفوع</label><strong className="num paid">{money(x.paid)}</strong></div>
                      <div><label>المتبقي</label><strong className="num rem">{money(x.remaining)}</strong></div>
                    </div>
                    <dl className="akv">
                      <dt>رقم القطعة</dt><dd className="num">{x.plot_number || 'لسه متخصصتش'}</dd>
                      <dt>الملكية</dt><dd>{x.ownership}</dd>
                      <dt>جاهز للتسليم</dt><dd>{x.ready ? 'نعم' : 'لا'}</dd>
                      <dt>صاحب الإعلان</dt><dd>{x.owner_name}</dd>
                      <dt>تليفون التواصل</dt><dd><Phone value={x.contact_phone} /></dd>
                      {x.account_phone && x.account_phone !== x.contact_phone && (<><dt>رقم الحساب</dt><dd><Phone value={x.account_phone} /></dd></>)}
                      {Number(x.request_count) > 0 && (<><dt>طلبات عليها</dt><dd className="num">{x.request_count}</dd></>)}
                    </dl>
                    {x.description && <div className="desc">{x.description}</div>}
                    <div className="aacts">
                      {x.status !== 'approved' && x.status !== 'sold' && (
                        <button className="btn primary" disabled={busyId === x.id} onClick={() => setStatus(x.id, 'approved')}>موافقة ونشر</button>
                      )}
                      {x.status === 'pending' && (
                        <button className="btn danger" disabled={busyId === x.id} onClick={() => setStatus(x.id, 'rejected')}>رفض</button>
                      )}
                      {x.status === 'approved' && (<>
                        <button className="btn" disabled={busyId === x.id} onClick={() => setStatus(x.id, 'sold')}>اتباعت</button>
                        <button className="btn danger" disabled={busyId === x.id} onClick={() => setStatus(x.id, 'rejected')}>إخفاء</button>
                      </>)}
                      {(x.status === 'rejected' || x.status === 'sold') && (
                        <button className="btn" disabled={busyId === x.id} onClick={() => setStatus(x.id, 'pending')}>رجّعه للمراجعة</button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
