'use client';
import { Children, useEffect, useRef, useState } from 'react';
import {
  SITE, STATUSES, FACADES, VIEWS, PHONE_RE, RECEIVED_STATUS, WAIVER_PER_M, DISTRICTS, NEIGHBORHOODS,
  INST_COUNT, BUILD_YEARS, CHECK_UNPAID_STATUS, COMPLETED_STATUS,
  money, listingCode, normalizePhone, toEnglishDigits, statusLabel,
  breakdown, checkFor, legalCalc, LEGAL, addYears, fmtMonth, monthBefore,
} from '@/lib/site';
import SheetTop from './SheetTop';
import { r1, origRangeFor } from '@/lib/site';
import { PriceSeal } from './LegalCalc';
import { uploadPhoto, photoUrl } from '@/lib/supabase';

const STEP_NAMES = ['المكان', 'المساحة والحالة', 'المميزات والصورة', 'السعر والدفع', 'البيانات'];

const blank = () => ({
  zone: '', district: '', neighborhood: '', block: '', plot_number: '',
  area_orig: '', area_final: '', land_status: 0, facade: '', view_type: '', received: '',
  over_amount: '', check_manual: '', photo: '', tier: '', tierCap: '', manual: {},
  pay: { completion: '', completion_paid: false, completion_due: '', inst: { value: '', first: '', last: '' } },
  description: '', owner_name: '', contact_phone: '',
});

function fromListing(x) {
  const p = x.pay || {};
  const v5 = p.v === 5;
  // Imported listings only have a total price: keep it by treating it as الأوفر until the real numbers are typed.
  const legacyOver = !v5 && !Number(x.over_amount) ? Math.max(0, Number(x.price || 0) - Number(x.paid || 0)) : 0;
  return {
    ...blank(),
    zone: x.zone || '', district: x.district || '', neighborhood: x.neighborhood || '',
    block: x.block || '', plot_number: x.plot_number || '',
    area_orig: x.area_orig ?? x.area ?? '', area_final: x.area_final ?? x.area ?? '',
    land_status: x.land_status || 0, facade: x.facade || '', view_type: x.view_type || '',
    received: p.received || '',
    over_amount: x.over_amount || legacyOver || '',
    check_manual: p.check || '',
    // A saved listing keeps its own numbers; the admin can switch any of them back to the automatic calculation.
    // Only listings saved with the new form keep their numbers; older ones get the automatic calculation.
    manual: v5 ? { check: true, completion: true, inst: true } : {},
    tier: v5 && LEGAL.tiers.includes(Number(x.area_final)) ? Number(x.area_final) : '',
    pay: {
      completion: p.completion || '', completion_paid: !!p.completion_paid, completion_due: p.completion_due || '',
      inst: { value: p.inst?.value || '', first: p.inst?.first || '', last: p.inst?.last || '' },
    },
    description: x.description || '', owner_name: x.owner_name || '', contact_phone: x.contact_phone || '',
    photo: x.photo || '',
  };
}

const num = (v) => (v === '' || v == null ? '' : Number(toEnglishDigits(v)));
// The numbers the form uses: the calculation from أصل المساحة, unless the seller typed their own.
function eff(d) {
  const a = num(d.area_orig) || 0;
  const calc = legalCalc(a, d.tier);
  const auto = (k) => calc && !d.manual?.[k];
  // With a calculation the slider picks the tier; without one the area after legalization is optional.
  const area_final = calc ? calc.tier : (num(d.area_final) || a || 0);
  const check = checkFor(a) == null ? (num(d.check_manual) || 0) : checkFor(a);
  return {
    calc, area_final, check,
    completion: auto('completion') ? calc.completion : (num(d.pay.completion) || 0),
    instValue: auto('inst') ? calc.instValue : (num(d.pay.inst.value) || 0),
  };
}

// The listing as it will be saved; breakdown() works out every automatic box from it.
function asListing(d) {
  const received = d.land_status === RECEIVED_STATUS;
  const e = eff(d);
  const area = e.area_final;
  const pay = { v: 5 };
  pay.check = e.check;
  pay.waiver = area * WAIVER_PER_M;
  if (received && d.received) pay.received = d.received;
  // دفعة الاستكمال and الأقساط count once they have a value.
  if (e.completion > 0) {
    const paid = d.land_status >= COMPLETED_STATUS;
    pay.completion = e.completion;
    pay.completion_paid = paid;
    if (!paid && d.pay.completion_due) pay.completion_due = d.pay.completion_due;
  }
  if (e.instValue > 0) {
    pay.inst = { value: e.instValue, count: INST_COUNT };
    if (received) { pay.inst.first = d.pay.inst.first || ''; pay.inst.last = d.pay.inst.last || ''; }
  }
  return { land_status: d.land_status, area_final: area, area_orig: num(d.area_orig), over_amount: num(d.over_amount) || 0, pay };
}

function toPayload(d) {
  const l = asListing(d), b = breakdown(l);
  return {
    zone: d.zone, district: d.district.trim(), neighborhood: d.neighborhood.trim(), block: d.block.trim(),
    plot_number: d.plot_number.trim(), area_orig: num(d.area_orig), area_final: eff(d).area_final,
    land_status: d.land_status, facade: d.facade, view_type: d.view_type,
    price: b.price, paid: b.paid, over_amount: b.over, pay: l.pay,
    description: d.description.trim(), owner_name: d.owner_name.trim(), contact_phone: normalizePhone(d.contact_phone),
    photo: d.photo,
  };
}

function validate(step, d, admin) {
  if (step === 2 && !admin && !d.photo) return 'ارفع صورة القطعة أو الخريطة وعليها سهم على مكان القطعة.';
  const received = d.land_status === RECEIVED_STATUS;
  if (step === 1 && !(num(d.area_orig) > 0)) return 'اكتب أصل المساحة.';
  if (step === 1 && num(d.area_orig) < LEGAL.minArea) return `أقل مساحة ${LEGAL.minArea} م².`;
  if (step === 1 && !d.land_status) return 'اختار حالة القطعة.';
  if (step === 1 && received && !d.received) return 'اختار تاريخ الاستلام (الشهر والسنة).';
  if (step === 3) {
    const inst = eff(d).instValue > 0;
    if (String(d.over_amount).trim() === '') return 'اكتب الأوفر المطلوب.';
    if (inst && received && (!d.pay.inst.first || !d.pay.inst.last)) return 'القطعة مستلمة: اختار موعد أول قسط وآخر قسط.';
    if (inst && received && monthBefore(d.pay.inst.last, d.pay.inst.first)) return 'موعد آخر قسط لازم يكون بعد أول قسط.';
    if (!(breakdown(asListing(d)).price > 0)) return 'السعر الكلي لازم يكون أكبر من صفر: راجع الأوفر والبنود.';
  }
  if (step === 4 && d.owner_name.trim().length < 2) return 'اكتب الاسم.';
  if (step === 4 && !PHONE_RE.test(normalizePhone(d.contact_phone))) return 'اكتب رقم موبايل مصري صح، زي 01012345678.';
  return '';
}

function Chips({ options, value, onPick }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onPick(value === o ? '' : o)}>{o}</button>
      ))}
    </div>
  );
}

// A box the form fills by itself. count: show a plain number instead of an amount.
// parts: [label, amount] rows showing what the total is made of.
function Auto({ label, value, empty, note, count, text, full, parts }) {
  const shown = text ?? (count ? (value === '' || value == null ? '' : String(value)) : value ? <><span className="num">{money(value)}</span> ج.م</> : '');
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <span className="lbl">{label} <small className="auto-tag">(يحدد تلقائيا)</small></span>
      <div className={`autobox${shown ? '' : ' empty'}`}>{shown || empty || (count ? '0' : '0 ج.م')}</div>
      {parts?.length > 0 && (
        <ul className="parts">{parts.map(([k, v]) => <li key={k}><span>{k}</span><b className="num">{money(v)} ج.م</b></li>)}</ul>
      )}
      {note && <span className="hint">{note}</span>}
    </div>
  );
}

// Plot photo: uploaded right away, so the form only keeps its path.
function PhotoField({ value, onChange, required }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(''); setBusy(true);
    try { onChange(await uploadPhoto(file)); } catch (x) { setErr(x?.message === 'not_image' ? 'اختار صورة (JPG أو PNG).' : 'الصورة مترفعتش. جرب تاني أو اختار صورة تانية.'); }
    setBusy(false);
  }
  return (
    <div className="field full photo-field">
      <span className="lbl sec-lbl">صورة القطعة{required ? ' · إجباري' : ''}</span>
      <div className="photo-guide">
        <b>إزاي تصوّرها؟</b>
        <ul>
          <li>صوّر القطعة نفسها من الشارع، <span>أو</span></li>
          <li>خد سكرين شوت من الخريطة (جوجل ماب أو خريطة الجهاز) وارسم عليها <b>سهم</b> على مكان القطعة.</li>
        </ul>
      </div>
      {value ? (
        <div className="photo-prev">
          <img src={photoUrl(value)} alt="صورة القطعة" />
          <label className="btn soft">تغيير الصورة<input type="file" accept="image/*" onChange={pick} hidden /></label>
        </div>
      ) : (
        <label className={`photo-drop${busy ? ' busy' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="3" /><circle cx="12" cy="12.5" r="3.5" /><path d="M8.5 5l1.5-2h4l1.5 2" /></svg>
          <b>{busy ? 'بنرفع الصورة...' : 'اضغط هنا وارفع الصورة'}</b>
          <small>من الكاميرا أو من الصور على موبايلك</small>
          <input type="file" accept="image/*" onChange={pick} disabled={busy} hidden />
        </label>
      )}
      {err && <p className="form-error">{err}</p>}
    </div>
  );
}

// المساحة بعد التقنين: a slider over the official tiers.
// cap: the tier the seller settled on; the slider can only go down from it. showRange: hint the original area for the chosen tier.
function TierSlider({ value, suggested, onChange, onClear, cap, showRange }) {
  const tiers = LEGAL.tiers;
  const idx = tiers.indexOf(Number(value));
  const capIdx = cap ? tiers.indexOf(Number(cap)) : tiers.length - 1;
  const range = showRange && idx >= 0 ? origRangeFor(value) : null;
  return (
    <div className="field full tier-field">
      <span className="lbl">المساحة بعد التقنين <small className="auto-tag">اختياري</small></span>
      <div className="tier-now">
        {idx >= 0 ? <><b className="num">{value}</b> م²{suggested === Number(value) && <small className="auto-on">الأقرب لمساحتك</small>}</> : <span className="muted">مش محددة</span>}
        {idx >= 0 && onClear && <button type="button" className="auto-reset" onClick={onClear}>مسح</button>}
      </div>
      <input type="range" className="tier-range" min={0} max={tiers.length - 1} step={1} value={idx >= 0 ? idx : 0}
        aria-label="المساحة بعد التقنين" onChange={(ev) => onChange(tiers[Math.min(Number(ev.target.value), capIdx)])} />
      <div className="tier-ticks" aria-hidden="true">{tiers.map((t, i) => <span key={t} className={t === Number(value) ? 'on' : i > capIdx ? 'off' : ''}>{t}</span>)}</div>
      {cap && capIdx < tiers.length - 1 && <small className="tier-cap">تقدر تقلل المساحة بس، مش تزوّدها عن <b className="num">{cap}</b> م²</small>}
      {range && <small className="tier-range-hint">أصل المساحة تقريباً {range.to ? <>من <b className="num">{range.from}</b> لـ <b className="num">{range.to}</b> م²</> : <>من <b className="num">{range.from}</b> م² وطالع</>}</small>}
    </div>
  );
}

// الحالة: two halves (غير مخصصة / مخصصة); each opens its three statuses, then only the choice is shown.
const STATUS_GROUPS = [
  { key: 'un', name: 'غير مخصصة', ids: [1, 2, 3] },
  { key: 'al', name: 'مخصصة', ids: [4, 5, 6] },
];
function StatusPicker({ value, onChange }) {
  const [open, setOpen] = useState(null);
  const chosen = Number(value) || 0;
  const group = STATUS_GROUPS.find((g) => g.key === open);
  return (
    <div className="field full status-pick">
      <span className="lbl">اختار الحالة (غير مخصصة / مخصصة)</span>
      {chosen && !open ? (
        <button type="button" id="w-status" className="sp-chosen" onClick={() => setOpen(chosen <= 3 ? 'un' : 'al')} aria-label={`الحالة: ${STATUSES[chosen - 1]}، اضغط للتغيير`}>
          <b>{STATUSES[chosen - 1]}</b>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      ) : (
        <div className="sp-wrap">
          <div className="sp-halves">
            {STATUS_GROUPS.map((g) => (
              <button key={g.key} type="button" id={g.key === 'un' ? 'w-status' : undefined} className={`sp-half${open === g.key ? ' on' : ''}`}
                aria-expanded={open === g.key} onClick={() => setOpen(open === g.key ? null : g.key)}>
                <b>{g.name}</b>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            ))}
          </div>
          {group && (
            <ul className={`sp-list ${group.key}`} role="listbox" aria-label={group.name}>
              {group.ids.map((id) => (
                <li key={id}>
                  <button type="button" role="option" aria-selected={chosen === id} className={chosen === id ? 'on' : ''}
                    onClick={() => { onChange(id); setOpen(null); }}>{STATUSES[id - 1]}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Shows whether a value comes from the calculation, with a way back to it after an edit.
function AutoTag({ manual, onReset, hasCalc }) {
  if (!hasCalc) return null;
  return manual ? <button type="button" className="auto-reset" onClick={onReset}>رجّع للتلقائي</button> : null;
}

// One payment item: name, its amount, and where it goes (المطلوب دفعه / المتبقي).
function PayItem({ title, amount, route, remLabel = 'متبقي', hint, children, forceOpen }) {
  const [open, setOpen] = useState(false);
  const shown = open || !!forceOpen;
  const hasBody = !!hint || Children.toArray(children).length > 0;
  return (
    <section className={`pitem branch tone-${route || 'none'}${shown ? ' open' : ''}`}>
      <button type="button" className="pi-head" aria-expanded={hasBody ? shown : undefined} disabled={!hasBody} onClick={() => setOpen((o) => !o)}>
        <b>{title}</b>
        {route && <em className={`tag ${route}`}>{route === 'paid' ? 'المطلوب دفعه' : remLabel}</em>}
        <span className="pi-amt">{amount ? <><i className="num">{money(amount)}</i> ج.م</> : '—'}</span>
        {hasBody && <svg className="pi-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>}
      </button>
      {hasBody && !shown && <small className="pi-more">اضغط لعرض التفاصيل</small>}
      {shown && hint && <small className="pi-hint">{hint}</small>}
      {shown && Children.toArray(children).length > 0 && <div className="pi-body">{children}</div>}
    </section>
  );
}

function Money({ id, label, value, onChange, full, tag, warn }) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="money-in">
        <input id={id} type="number" inputMode="decimal" min="0" value={value} onFocus={(e) => e.target.select()} onChange={(e) => onChange(e.target.value)} />
        {tag}
      </div>
      <span className="hint num">{value ? `${money(num(value))} ج.م` : ''}</span>
      {warn && <span className="field-warn" role="alert">{warn}</span>}
    </div>
  );
}

// Month + year as two lists. Starts as "—" (غير محدد); phones' own date wheels pre-fill the current month, so they are not used.
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => fmtMonth(`2000-${String(i + 1).padStart(2, '0')}`).split(' ')[0]);
const YEARS = Array.from({ length: 26 }, (_, i) => String(2015 + i));
function Month({ id, label, value, onChange, disabled, placeholder, clearable }) {
  const ok = /^\d{4}-\d{2}$/.test(value || '');
  const [y, setY] = useState(ok ? value.slice(0, 4) : '');
  const [m, setM] = useState(ok ? value.slice(5, 7) : '');
  // Only an outside change (e.g. a reset) resyncs; a half-picked month/year stays on screen.
  const sent = useRef(value || '');
  useEffect(() => { if ((value || '') === sent.current) return; sent.current = value || ''; setY(ok ? value.slice(0, 4) : ''); setM(ok ? value.slice(5, 7) : ''); }, [value, ok]);
  const pick = (ny, nm) => { const v = ny && nm ? `${ny}-${nm}` : ''; sent.current = v; setY(ny); setM(nm); onChange(v); };
  const empty = !y && !m;
  return (
    <div className="field"><label htmlFor={id}>{label}
      {clearable && !empty && <button type="button" className="auto-reset" onClick={() => pick('', '')}>غير محدد</button>}</label>
      {disabled
        ? <input id={id} disabled placeholder={placeholder} />
        : (
          <div className="month-pick">
            <select id={id} aria-label="الشهر" value={m} onChange={(e) => pick(y, e.target.value)}>
              <option value="">{empty ? 'غير محدد' : 'الشهر —'}</option>
              {MONTH_NAMES.map((n, i) => <option key={n} value={String(i + 1).padStart(2, '0')}>{n}</option>)}
            </select>
            <select aria-label="السنة" value={y} onChange={(e) => pick(e.target.value, m)}>
              <option value="">{empty ? '—' : 'السنة —'}</option>
              {YEARS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
      <span className="hint">{!disabled && ok ? fmtMonth(value) : !disabled && !empty ? 'كمّل الشهر والسنة' : ''}</span>
    </div>
  );
}

// One calendar to pick a month and a year; starts at "غير محدد" (works the same on Android and iPhone).
function MonthCal({ id, label, value, onChange }) {
  const ok = /^\d{4}-\d{2}$/.test(value || '');
  const [open, setOpen] = useState(false);
  const [yr, setYr] = useState(() => (ok ? Number(value.slice(0, 4)) : new Date().getFullYear()));
  const pick = (v) => { onChange(v); setOpen(false); };
  return (
    <div className="field mcal">
      <label htmlFor={id}>{label}</label>
      <button id={id} type="button" className={`mcal-btn${ok ? '' : ' empty'}${open ? ' on' : ''}`} aria-expanded={open}
        onClick={() => { if (!open && ok) setYr(Number(value.slice(0, 4))); setOpen((o) => !o); }}>
        <svg className="mcal-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
        <span>{ok ? fmtMonth(value) : 'غير محدد'}</span>
        <svg className="mcal-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="mcal-pop" role="dialog" aria-label="اختار الشهر والسنة">
          <div className="mcal-yr">
            <button type="button" aria-label="السنة اللي قبلها" onClick={() => setYr((y) => y - 1)}>›</button>
            <b className="num">{yr}</b>
            <button type="button" aria-label="السنة اللي بعدها" onClick={() => setYr((y) => y + 1)}>‹</button>
          </div>
          <div className="mcal-grid">
            {MONTH_NAMES.map((n, i) => {
              const v = `${yr}-${String(i + 1).padStart(2, '0')}`;
              return <button key={n} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => pick(v)}>{n}</button>;
            })}
          </div>
          <button type="button" className="mcal-clear" onClick={() => pick('')}>غير محدد</button>
        </div>
      )}
    </div>
  );
}

// mode: 'public' (visitor offer) | 'admin' (add or edit). onSubmit(payload) resolves to an error message or ''.
export default function ListingWizard({ mode = 'public', initial, editId, onClose, onSubmit }) {
  const admin = mode === 'admin';
  const [d, setD] = useState(() => (initial ? fromListing(initial) : blank()));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sheet = useRef(null);
  const itemsRef = useRef(null);
  const headRef = useRef(null);
  useEffect(() => {
    const el = headRef.current, sh = sheet.current;
    if (!el || !sh || typeof ResizeObserver === 'undefined') return;
    const apply = () => sh.style.setProperty('--head-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);
  const [itemsOpen, setItemsOpen] = useState(false);
  const toggleItems = () => {
    const open = !itemsOpen;
    setItemsOpen(open);
    if (open) setTimeout(() => itemsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
  };

  const set = (k, v) => setD((s) => ({ ...s, [k]: v }));
  const setPay = (k, v) => setD((s) => ({ ...s, pay: { ...s.pay, [k]: v } }));
  const setInst = (k, v) => setD((s) => ({ ...s, pay: { ...s.pay, inst: { ...s.pay.inst, [k]: v } } }));
  const edit = (k, apply) => setD((s) => ({ ...apply(s), manual: { ...s.manual, [k]: true } }));
  const reset = (k) => setD((s) => ({ ...s, manual: { ...s.manual, [k]: false } }));
  const go = (n) => { setError(''); setStep(n); sheet.current?.scrollTo({ top: 0 }); };

  const b = breakdown(asListing(d));
  const e = eff(d);
  const c = e.calc;
  const area = e.area_final;
  const tag = (k) => <AutoTag hasCalc={!!c} manual={!!d.manual?.[k]} onReset={() => reset(k)} />;
  const received = d.land_status === RECEIVED_STATUS;
  const checkUnpaid = d.land_status === CHECK_UNPAID_STATUS;
  // Names (no amounts) of what makes up المتبقي, for the quick review.
  // For the quick review: item names (no amounts) on each side, and whether each amount is automatic or typed by the client.
  const src = {
    check: checkFor(num(d.area_orig)) != null ? 'auto' : 'client',
    comp: c && !d.manual?.completion ? 'auto' : 'client',
    inst: c && !d.manual?.inst ? 'auto' : 'client',
  };
  const remItems = [
    b.check > 0 && !b.checkPaid && ['شيك التقنين', src.check],
    b.comp > 0 && !b.compPaid && ['دفعة الاستكمال', src.comp],
    b.inst?.left > 0 && ['الأقساط المتبقية', src.inst],
    b.waiver > 0 && ['مصاريف التنازل', 'auto'],
  ].filter(Boolean);
  const paidItems = [
    b.over > 0 && ['الأوفر', 'client'],
    b.check > 0 && b.checkPaid && ['شيك التقنين', src.check],
    b.comp > 0 && b.compPaid && ['دفعة الاستكمال', src.comp],
    b.inst?.paid > 0 && ['الأقساط المدفوعة', src.inst],
  ].filter(Boolean);
  const srcTag = (k) => <small className={`src-tag ${k}`}>{k === 'auto' ? 'تلقائي' : 'كتبها العميل'}</small>;
  const title = admin ? (editId ? `تعديل ${listingCode(initial || editId)}` : 'إضافة إعلان') : 'اعرض قطعتك';
  const last = step === STEP_NAMES.length - 1;

  async function next(e) {
    e.preventDefault();
    const err = validate(step, d, admin);
    if (err) return setError(err);
    if (!last) return go(step + 1);
    setBusy(true);
    const msg = await onSubmit(toPayload(d));
    setBusy(false);
    if (msg) setError(msg);
  }

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet has-top wizard" ref={sheet} onSubmit={next} noValidate>
        <div className="wz-head" ref={headRef}>
          <SheetTop title={title} onClose={onClose} />
        </div>
        <div className="steps" aria-hidden="true">
          {STEP_NAMES.map((n, i) => <i key={n} className={i < step ? 'done' : i === step ? 'on' : ''} />)}
        </div>
        <div className="step-name">خطوة <span className="num">{step + 1}</span> من <span className="num">{STEP_NAMES.length}</span>: <b>{STEP_NAMES[step]}</b></div>

        {step === 0 && (
          <div className="grid">
            <div className="field full"><span className="lbl">المدينة</span><div className="fixed">{SITE.governorate}</div></div>
            <div className="field full"><span className="lbl">التقسيم (الجمعية) <small className="auto-tag">اختياري</small></span>
              <div className="big-choice">
                {SITE.zones.map((z) => <button key={z} type="button" aria-pressed={d.zone === z} onClick={() => set('zone', d.zone === z ? '' : z)}>{z}</button>)}
              </div></div>
            <div className="field"><label htmlFor="w-dist">الحي</label>
              <select id="w-dist" value={d.district} onChange={(e) => set('district', e.target.value)}>
                <option value="">اختياري</option>
                {(DISTRICTS.includes(d.district) || !d.district ? DISTRICTS : [d.district, ...DISTRICTS]).map((v) => <option key={v}>{v}</option>)}
              </select></div>
            <div className="field"><label htmlFor="w-nb">المجاورة</label>
              <select id="w-nb" value={d.neighborhood} onChange={(e) => set('neighborhood', e.target.value)}>
                <option value="">اختياري</option>
                {(NEIGHBORHOODS.includes(d.neighborhood) || !d.neighborhood ? NEIGHBORHOODS : [d.neighborhood, ...NEIGHBORHOODS]).map((v) => <option key={v}>{v}</option>)}
              </select></div>
            <div className="field"><label htmlFor="w-block">البلوك</label>
              <input id="w-block" maxLength={40} value={d.block} onChange={(e) => set('block', e.target.value)} /></div>
            <div className="field"><label htmlFor="w-plot">رقم القطعة (لو موجود)</label>
              <input id="w-plot" maxLength={40} placeholder="سيبه فاضي لو لسه متخصصتش" value={d.plot_number} onChange={(e) => set('plot_number', e.target.value)} /></div>
          </div>
        )}

        {step === 1 && (
          <div className="grid">
            <div className="field"><label htmlFor="w-ao">أصل المساحة (م²)</label>
              <input id="w-ao" type="number" inputMode="decimal" min="0" value={d.area_orig} onChange={(ev) => setD((s) => ({ ...s, area_orig: ev.target.value, tier: '', tierCap: '' }))} /></div>
            {c ? (
              <>
                <TierSlider value={c.tier} suggested={legalCalc(num(d.area_orig)).tier} onChange={(t) => set('tier', t)}
                  cap={d.tierCap || Math.max(legalCalc(num(d.area_orig)).tier, Number(d.tier) || 0)} />
                <div className="full area-calc">
                  <span>الصافي بعد الطرق <b className="num">{c.net}</b> م²</span>
                  <span className="muted">الشريحة بتتحدد على الصافي بعد خصم الطرق، مش على أصل المساحة.</span>
                  {c.options.length > 1 && (
                    <div className="tier-choice">
                      <span>صافيك ما بين شريحتين، اختار:</span>
                      {c.options.map((t) => {
                        const diff = r1(Math.abs(t - c.net));
                        return (
                          <button key={t} type="button" aria-pressed={c.tier === t} onClick={() => setD((s) => ({ ...s, tier: t, tierCap: t }))}>
                            <b className="num">{t}</b> م²
                            <small>{t > c.net ? <>تشتري <span className="num">{diff}</span> م²</> : <>تبيع <span className="num">{diff}</span> م²</>}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <TierSlider value={d.area_final} onChange={(t) => set('area_final', t)} onClear={() => set('area_final', '')} showRange={!num(d.area_orig)} />
            )}
            {num(d.area_orig) >= LEGAL.autoBelow && (
              <p className="full pi-note">حسبة المساحات من 500 م² وطالع لسه بتتراجع، فاكتب المساحة بعد التقنين وأرقام الدفع بنفسك.</p>
            )}
            <StatusPicker value={d.land_status} onChange={(v) => set('land_status', v)} />
            {received && (
              <div className="full paybox">
                <h4>مسار التسليم والبناء</h4>
                <div className="grid">
                  <Month id="w-recv" label="تاريخ الاستلام (إجباري)" value={d.received} onChange={(v) => set('received', v)} />
                  <Auto label="تنتهي مهلة البناء في" text={d.received ? fmtMonth(addYears(d.received, BUILD_YEARS)) : ''}
                    empty="اختار تاريخ الاستلام الأول" note={`بعد ${BUILD_YEARS} سنين من تاريخ الاستلام`} />
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid">
            <div className="field full"><span className="lbl">الواجهة</span><Chips options={FACADES} value={d.facade} onPick={(v) => set('facade', v)} /></div>
            <div className="field full"><span className="lbl">الإطلالة</span><Chips options={VIEWS} value={d.view_type} onPick={(v) => set('view_type', v)} /></div>
            <PhotoField value={d.photo} onChange={(v) => { set('photo', v); setError(''); }} required={!admin} />
          </div>
        )}

        {step === 3 && (
          <div className="pay-step">
            <PriceSeal />
            <div className="ptotals mirror" aria-live="polite">
              <div className="pt hero-t">
                <span>السعر الكلي <small>تلقائي</small></span>
                <b><i className="num">{money(b.price)}</i> ج.م</b>
                <small>المطلوب دفعه (شامل الأوفر) + المتبقي</small>
              </div>
              <div className="pt-tree">
                <div className="pt paid-t branch paid-split">
                  <div className="paid-main">
                    <span className="pt-lbl">المطلوب دفعه <small>تلقائي</small></span>
                    {b.paid ? <b><i className="num">{money(b.paid)}</i> ج.م</b> : <b className="none">—</b>}
                    <small>الأوفر المطلوب + كل اللي دفعته</small>
                  </div>
                  {d.over_amount === '' && (
                    <svg className="over-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6" /></svg>
                  )}
                  <label className="pt-over" htmlFor="w-over">
                    <span>الأوفر المطلوب <em>إجباري</em></span>
                    <span className="pt-over-in">
                      <input id="w-over" type="number" inputMode="numeric" min="0" placeholder="اكتب هنا" value={d.over_amount}
                        onFocus={(e) => e.target.select()} onChange={(e) => set('over_amount', e.target.value)} />
                      <i>ج.م</i>
                    </span>
                    <u>{d.over_amount !== '' ? <><b className="num">{money(num(d.over_amount))}</b> ج.م</> : 'اضغط لكتابة الأوفر المطلوب'}</u>
                  </label>
                </div>
                <div className="pt rem-t branch">
                  <button type="button" className={`items-btn${itemsOpen ? ' on' : ''}`} aria-expanded={itemsOpen} aria-controls="w-items" onClick={toggleItems}>
                    <b>البنود</b>
                    <small>{itemsOpen ? 'اضغط لإخفاء البنود' : 'اضغط لإظهار البنود'}</small>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  <span className="pt-lbl">المتبقي <small>تلقائي</small></span>
                  <b><i className="num">{money(b.remaining)}</i> ج.م</b>
                  <div className="rem-parts">
                    <small>يدفعه المشتري لاحقاً:</small>
                    <span className="arc">الاستكمال</span><i aria-hidden="true">+</i>
                    <span className="arc">الأقساط</span><i aria-hidden="true">+</i>
                    <span className="arc">الشيك لو لم يتم دفعه</span>
                  </div>
                </div>
              </div>
            </div>

            {!c && (
              <p className="calc-off">الحساب التلقائي بيشتغل لما تكتب <b>أصل المساحة</b> (من {LEGAL.minArea} لأقل من {LEGAL.autoBelow} م²) في الخطوة التانية. غير كده اكتب الأرقام بنفسك.</p>
            )}
            <section className={`items-sec${itemsOpen || error ? ' open' : ''}`} id="w-items" ref={itemsRef}>
              <h4 className="items-h-wrap">
                <button type="button" className={`items-h${itemsOpen ? ' on' : ''}`} aria-expanded={itemsOpen} aria-controls="w-items" onClick={() => setItemsOpen((o) => !o)}>
                  <span>البنود <small>({itemsOpen ? 'اضغط لإخفاء البنود' : 'اضغط لإظهار البنود'})</small></span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
              </h4>
              {(itemsOpen || !!error) && (
              <div className="items-tree">

            <PayItem title="شيك التقنين" forceOpen={!!error} amount={b.check} route={d.land_status ? (checkUnpaid ? 'rem' : 'paid') : ''}
              hint={checkFor(num(d.area_orig)) != null ? `حسب أصل المساحة ${num(d.area_orig)} م²` : ''}>
              {checkFor(num(d.area_orig)) == null && (
                <Money id="w-check" label="قيمة الشيك" value={d.check_manual} onChange={(v) => set('check_manual', v)} />
              )}
              {!d.land_status && <p className="pi-note">اختار الحالة علشان يتحدد الشيك يتضاف فين.</p>}
            </PayItem>

            <PayItem title="مصاريف التنازل" forceOpen={!!error} amount={b.waiver} route={b.waiver ? 'rem' : ''}>
              {!area && <p className="pi-note">بتتحسب لوحدها من المساحة.</p>}
            </PayItem>

            <PayItem title="دفعة الاستكمال" forceOpen={!!error} amount={b.comp || null} route={b.comp ? (b.compPaid ? 'paid' : 'rem') : ''} hint={c ? 'بتتدفع بالفيزا' : 'سيبها فاضية لو مفيش'}>
                <Money id="w-comp" label="قيمة الاستكمال (جنيه)" tag={tag('completion')}
                  warn={c && d.manual?.completion && r1(num(d.pay.completion)) !== r1(e.calc.completion) ? 'هذه القيمة غير منطقية' : ''}
                  value={c && !d.manual?.completion ? e.completion : d.pay.completion}
                  onChange={(v) => edit('completion', (s) => ({ ...s, pay: { ...s.pay, completion: v } }))} />
                {(d.land_status >= COMPLETED_STATUS || !d.land_status) && <p className="pi-note">{d.land_status >= COMPLETED_STATUS
                  ? 'القطعة مستكملة، فالاستكمال اتدفع وبيروح للمطلوب دفعه.'
                  : 'اختار الحالة علشان يتحدد الاستكمال مدفوع ولا لأ.'}</p>}
                {d.land_status < COMPLETED_STATUS && (
                  <MonthCal id="w-compdue" label="موعد الاستكمال" value={d.pay.completion_due} onChange={(v) => setPay('completion_due', v)} />
                )}
            </PayItem>

            <PayItem title="الأقساط" forceOpen={!!error} amount={b.inst ? b.inst.value * INST_COUNT : null} route={b.inst ? (b.inst.leftN > 0 ? 'rem' : 'paid') : ''} hint={c ? '3 أقساط' : 'سيبها فاضية لو مفيش أقساط'}>
                <Money id="w-iv" label="قيمة القسط" tag={tag('inst')}
                  value={c && !d.manual?.inst ? e.instValue : d.pay.inst.value}
                  onChange={(v) => edit('inst', (s) => ({ ...s, pay: { ...s.pay, inst: { ...s.pay.inst, value: v } } }))} />
                <div className="field"><label htmlFor="w-ic">عدد الأقساط</label>
                  <input id="w-ic" disabled value={INST_COUNT} readOnly /></div>
                <Month id="w-if" label={`موعد أول قسط${received ? ' · إجباري' : ''}`} value={d.pay.inst.first} onChange={(v) => setInst('first', v)}
                  disabled={!received} placeholder="يحدد بعد الاستلام" />
                <Month id="w-il2" label={`موعد آخر قسط${received ? ' · إجباري' : ''}`} value={d.pay.inst.last} onChange={(v) => setInst('last', v)}
                  disabled={!received} placeholder="يحدد بعد الاستلام" />
              {b.inst && (
                <div className="inst-split">
                  <div className="paid-t"><span>مدفوعة</span><b><i className="num">{b.inst.paidN}</i> قسط · <i className="num">{money(b.inst.paid)}</i> ج.م</b></div>
                  <div className="rem-t"><span>متبقية</span><b><i className="num">{b.inst.leftN}</i> قسط · <i className="num">{money(b.inst.left)}</i> ج.م</b></div>
                </div>
              )}
              {b.inst && !received && <p className="pi-note">أول قسط يتم دفعه بعد سنة من موعد الاستكمال.</p>}
            </PayItem>
              </div>
              )}
            </section>
          </div>
        )}

        {step === 4 && (
          <div className="grid">
            <div className="field"><label htmlFor="w-owner">{admin ? 'اسم صاحب الإعلان' : 'اسمك'}</label>
              <input id="w-owner" autoComplete={admin ? 'off' : 'name'} maxLength={80} value={d.owner_name} onChange={(e) => set('owner_name', e.target.value)} /></div>
            <div className="field"><label htmlFor="w-phone">{admin ? 'تليفون صاحب الإعلان' : 'رقم تليفونك'}</label>
              <input id="w-phone" className="num" type="tel" inputMode="tel" autoComplete={admin ? 'off' : 'tel'} placeholder="01xxxxxxxxx"
                value={d.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} /></div>
            <div className="field full"><label htmlFor="w-desc">وصف (اختياري)</label>
              <textarea id="w-desc" maxLength={2000} placeholder="أي تفاصيل تانية عايز تقولها..." value={d.description} onChange={(e) => set('description', e.target.value)} /></div>
            <div className="field full"><span className="lbl">مراجعة سريعة</span>
              <dl className="summary">
                <dt>المكان</dt><dd>{[SITE.governorate, d.zone, d.district, d.neighborhood].filter(Boolean).join(' · ')}</dd>
                <dt>المساحة</dt><dd><span className="num">{area}</span> م²{num(d.area_orig) && num(d.area_orig) !== area ? <small className="muted"> (أصلها <span className="num">{num(d.area_orig)}</span> م²)</small> : null}</dd>
                <dt>الحالة</dt><dd>{statusLabel(d.land_status)}</dd>
                <dt>السعر الكلي</dt><dd><b className="num">{money(b.price)} ج.م</b></dd>
              </dl>
              <div className="rv-cols">
                <div className="rv-col rem">
                  <span>المتبقي</span>
                  <b className="num">{money(b.remaining)} ج.م</b>
                  {remItems.length > 0 ? <ul>{remItems.map(([t, k]) => <li key={t}>{t} {srcTag(k)}</li>)}</ul> : <small className="muted">مفيش</small>}
                </div>
                <div className="rv-col paid">
                  <span>المدفوع</span>
                  <b className="num">{money(b.paid)} ج.م</b>
                  {paidItems.length > 0 ? <ul>{paidItems.map(([t, k]) => <li key={t}>{t} {srcTag(k)}</li>)}</ul> : <small className="muted">مفيش</small>}
                </div>
              </div></div>
          </div>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="wz-actions">
          {step > 0 && <button type="button" className="btn" onClick={() => go(step - 1)}>رجوع</button>}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'استنى...' : !last ? 'التالي' : admin ? (editId ? 'حفظ التعديلات' : 'إضافة ونشر') : 'ابعت للمراجعة'}
          </button>
        </div>
      </form>
    </div>
  );
}
