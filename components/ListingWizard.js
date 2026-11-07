'use client';
import { useRef, useState } from 'react';
import {
  SITE, STATUSES, FACADES, VIEWS, PHONE_RE, RECEIVED_STATUS, WAIVER_PER_M, DISTRICTS, NEIGHBORHOODS,
  INST_COUNT, BUILD_YEARS, CHECK_UNPAID_STATUS, COMPLETED_STATUS,
  money, listingCode, normalizePhone, toEnglishDigits, statusLabel,
  breakdown, checkFor, legalCalc, LEGAL, addYears, fmtMonth, monthBefore,
} from '@/lib/site';
import SheetTop from './SheetTop';
import { PRICE_NOTE } from '@/lib/site';
import { uploadPhoto, photoUrl } from '@/lib/supabase';

const STEP_NAMES = ['المكان', 'المساحة والحالة', 'المميزات والصورة', 'السعر والدفع', 'البيانات'];

const blank = () => ({
  zone: '', district: '', neighborhood: '', block: '', plot_number: '',
  area_orig: '', area_final: '', land_status: 0, facade: '', view_type: '', received: '',
  over_amount: '', check_manual: '', photo: '', tier: '', manual: {},
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
  const shown = text ?? (count ? (value === '' || value == null ? '' : String(value)) : value ? <><span className="num">{money(value)}</span> ج</> : '');
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <span className="lbl">{label} <small className="auto-tag">(يحدد تلقائيا)</small></span>
      <div className={`autobox${shown ? '' : ' empty'}`}>{shown || empty || (count ? '0' : '0 ج')}</div>
      {parts?.length > 0 && (
        <ul className="parts">{parts.map(([k, v]) => <li key={k}><span>{k}</span><b className="num">{money(v)} ج</b></li>)}</ul>
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
function TierSlider({ value, suggested, onChange, onClear }) {
  const tiers = LEGAL.tiers;
  const idx = tiers.indexOf(Number(value));
  return (
    <div className="field full tier-field">
      <span className="lbl">المساحة بعد التقنين <small className="auto-tag">اختياري</small></span>
      <div className="tier-now">
        {idx >= 0 ? <><b className="num">{value}</b> م²{suggested === Number(value) && <small className="auto-on">الأقرب لمساحتك</small>}</> : <span className="muted">مش محددة</span>}
        {idx >= 0 && onClear && <button type="button" className="auto-reset" onClick={onClear}>مسح</button>}
      </div>
      <input type="range" className="tier-range" min={0} max={tiers.length - 1} step={1} value={idx >= 0 ? idx : 0}
        aria-label="المساحة بعد التقنين" onChange={(ev) => onChange(tiers[Number(ev.target.value)])} />
      <div className="tier-ticks" aria-hidden="true">{tiers.map((t) => <span key={t} className={t === Number(value) ? 'on' : ''}>{t}</span>)}</div>
    </div>
  );
}

// Shows whether a value comes from the calculation, with a way back to it after an edit.
function AutoTag({ manual, onReset, hasCalc }) {
  if (!hasCalc) return null;
  return manual ? <button type="button" className="auto-reset" onClick={onReset}>معدّل يدوياً · رجّع للتلقائي</button> : null;
}

// One payment item: name, its amount, and where it goes (المطلوب دفعه / المتبقي).
function PayItem({ title, amount, route, hint, children }) {
  return (
    <section className={`pitem branch tone-${route || 'none'}`}>
      <header>
        <b>{title}</b>
        {route && <em className={`tag ${route}`}>{route === 'paid' ? 'المطلوب دفعه' : 'المتبقي'}</em>}
        <span className="pi-amt">{amount ? <><i className="num">{money(amount)}</i> ج</> : '—'}</span>
      </header>
      {hint && <small className="pi-hint">{hint}</small>}
      {children && <div className="pi-body">{children}</div>}
    </section>
  );
}

function Money({ id, label, value, onChange, full, tag }) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label htmlFor={id}>{label} {tag}</label>
      <input id={id} type="number" inputMode="decimal" min="0" value={value} onFocus={(e) => e.target.select()} onChange={(e) => onChange(e.target.value)} />
      <span className="hint num">{value ? `${money(num(value))} ج` : ''}</span>
    </div>
  );
}

function Month({ id, label, value, onChange, disabled, placeholder, clearable }) {
  return (
    <div className="field"><label htmlFor={id}>{label}
      {clearable && value && <button type="button" className="auto-reset" onClick={() => onChange('')}>غير محدد</button>}</label>
      {disabled
        ? <input id={id} disabled placeholder={placeholder} />
        : clearable && !value
          ? <span className="month-empty"><input id={id} type="month" value="" onChange={(e) => onChange(e.target.value)} /><i>غير محدد</i></span>
          : <input id={id} type="month" value={value} onChange={(e) => onChange(e.target.value)} />}
      <span className="hint">{!disabled && value ? fmtMonth(value) : ''}</span>
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
  const remItems = [
    b.check > 0 && !b.checkPaid && 'شيك التقنين',
    b.comp > 0 && !b.compPaid && 'دفعة الاستكمال',
    b.inst?.left > 0 && 'الأقساط المتبقية',
    b.waiver > 0 && 'مصاريف التنازل',
  ].filter(Boolean);
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
        <SheetTop title={title} onClose={onClose} />
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
              <input id="w-ao" type="number" inputMode="decimal" min="0" value={d.area_orig} onChange={(ev) => setD((s) => ({ ...s, area_orig: ev.target.value, tier: '' }))} /></div>
            {c ? (
              <>
                <TierSlider value={c.tier} suggested={legalCalc(num(d.area_orig)).tier} onChange={(t) => set('tier', t)} />
                <div className="full area-calc">
                  <span>الصافي بعد الطرق <b className="num">{c.net}</b> م²</span>
                  <span className="muted">الشريحة بتتحدد على الصافي بعد خصم الطرق، مش على أصل المساحة.</span>
                  {c.options.length > 1 && (
                    <div className="tier-choice">
                      <span>صافيك ما بين شريحتين، اختار:</span>
                      {c.options.map((t) => {
                        const diff = Math.abs(t - c.net);
                        return (
                          <button key={t} type="button" aria-pressed={c.tier === t} onClick={() => set('tier', t)}>
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
              <TierSlider value={d.area_final} onChange={(t) => set('area_final', t)} onClear={() => set('area_final', '')} />
            )}
            {num(d.area_orig) >= LEGAL.autoBelow && (
              <p className="full pi-note">حسبة المساحات من 500 م² وطالع لسه بتتراجع، فاكتب المساحة بعد التقنين وأرقام الدفع بنفسك.</p>
            )}
            <div className="field full"><label htmlFor="w-status">الحالة</label>
              <select id="w-status" value={d.land_status || ''} onChange={(e) => set('land_status', Number(e.target.value) || 0)}>
                <option value="">اختار الحالة</option>
                {STATUSES.map((t, i) => <option key={t} value={i + 1}>{t}</option>)}
              </select></div>
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
            <p className="pt-note" role="note">{PRICE_NOTE.split('، ').map((t, i, all) => <span key={i}>{t}{i < all.length - 1 ? '،' : ''}</span>)}</p>
            <div className="ptotals mirror" aria-live="polite">
              <div className="pt hero-t">
                <span>السعر الكلي <small>تلقائي</small></span>
                <b><i className="num">{money(b.price)}</i> ج</b>
                <small>المطلوب دفعه (شامل الأوفر) + المتبقي</small>
              </div>
              <div className="pt-tree">
                <div className="pt paid-t branch paid-split">
                  <div className="paid-main">
                    <span className="pt-lbl">المطلوب دفعه <small>تلقائي</small></span>
                    {b.paid ? <b><i className="num">{money(b.paid)}</i> ج</b> : <b className="none">—</b>}
                    <small>الأوفر المطلوب + كل اللي دفعته</small>
                  </div>
                  <button type="button" className="pt-over" onClick={() => { const el = document.getElementById('w-over'); el?.focus(); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>
                    <span>الأوفر</span>
                    <b><i className="num">{money(b.over)}</i> ج</b>
                    <u>اضغط لكتابة الأوفر المطلوب</u>
                  </button>
                </div>
                <button type="button" className={`items-btn branch${itemsOpen ? ' on' : ''}`} aria-expanded={itemsOpen} aria-controls="w-items" onClick={toggleItems}>
                  <b>البنود</b>
                  <small>{itemsOpen ? 'اضغط لإخفاء البنود' : 'اضغط لإظهار البنود'}</small>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <div className="pt rem-t branch">
                  <span className="pt-lbl">المتبقي <small>تلقائي</small></span>
                  <b><i className="num">{money(b.remaining)}</i> ج</b>
                  <small>يدفعه المشتري لاحقاً (المتبقي من الاستكمال والأقساط، والشيك لو لم يتم دفعه)</small>
                </div>
              </div>
            </div>

            {!c && (
              <p className="calc-off">الحساب التلقائي بيشتغل لما تكتب <b>أصل المساحة</b> (من {LEGAL.minArea} لأقل من {LEGAL.autoBelow} م²) في الخطوة التانية. غير كده اكتب الأرقام بنفسك.</p>
            )}
            <div className="over-box">
              <label htmlFor="w-over">الأوفر المطلوب <em>إجباري</em></label>
              <p>المبلغ اللي عايزه فوق المدفوع، بالجنيه.</p>
              <div className="over-in">
                <input id="w-over" type="number" inputMode="numeric" min="0" placeholder="مثلاً 500000" value={d.over_amount} onFocus={(e) => e.target.select()} onChange={(e) => set('over_amount', e.target.value)} />
                <span>جنيه</span>
              </div>
              {d.over_amount !== '' && <small className="num">{money(num(d.over_amount))} ج</small>}
            </div>

            <section className={`items-sec${itemsOpen || error ? ' open' : ''}`} id="w-items" ref={itemsRef}>
              <h4 className="items-h"><span>البنود</span><small>شيك التقنين · مصاريف التنازل · الاستكمال · الأقساط</small></h4>
              {(itemsOpen || !!error) && (
              <div className="items-tree">

            <PayItem title="شيك التقنين" amount={b.check} route={d.land_status ? (checkUnpaid ? 'rem' : 'paid') : ''}
              hint={checkFor(num(d.area_orig)) != null ? `حسب أصل المساحة ${num(d.area_orig)} م²` : ''}>
              {checkFor(num(d.area_orig)) == null && (
                <Money id="w-check" label="قيمة الشيك" value={d.check_manual} onChange={(v) => set('check_manual', v)} />
              )}
              {!d.land_status && <p className="pi-note">اختار الحالة علشان يتحدد الشيك يتضاف فين.</p>}
            </PayItem>

            <PayItem title="مصاريف التنازل" amount={b.waiver} route={b.waiver ? 'rem' : ''}>
              {!area && <p className="pi-note">بتتحسب لوحدها من المساحة.</p>}
            </PayItem>

            <PayItem title="دفعة الاستكمال" amount={b.comp || null} route={b.comp ? (b.compPaid ? 'paid' : 'rem') : ''} hint={c ? 'بتتدفع بالفيزا' : 'سيبها فاضية لو مفيش'}>
              <div className="grid">
                <Money id="w-comp" label="قيمة الاستكمال (جنيه)" tag={tag('completion')}
                  value={c && !d.manual?.completion ? e.completion : d.pay.completion}
                  onChange={(v) => edit('completion', (s) => ({ ...s, pay: { ...s.pay, completion: v } }))} />
                {(d.land_status >= COMPLETED_STATUS || !d.land_status) && <p className="pi-note full">{d.land_status >= COMPLETED_STATUS
                  ? 'القطعة مستكملة، فالاستكمال اتدفع وبيروح للمطلوب دفعه.'
                  : 'اختار الحالة علشان يتحدد الاستكمال مدفوع ولا لأ.'}</p>}
                {d.land_status < COMPLETED_STATUS && (
                  <Month id="w-compdue" clearable label="موعد الاستكمال" value={d.pay.completion_due} onChange={(v) => setPay('completion_due', v)} />
                )}
              </div>
            </PayItem>

            <PayItem title="الأقساط" amount={b.inst ? b.inst.value * INST_COUNT : null} route={b.inst ? (b.inst.leftN > 0 ? 'rem' : 'paid') : ''} hint={c ? '3 أقساط' : 'سيبها فاضية لو مفيش أقساط'}>
              <div className="grid">
                <Money id="w-iv" label="قيمة القسط" tag={tag('inst')}
                  value={c && !d.manual?.inst ? e.instValue : d.pay.inst.value}
                  onChange={(v) => edit('inst', (s) => ({ ...s, pay: { ...s.pay, inst: { ...s.pay.inst, value: v } } }))} />
                <div className="field"><label htmlFor="w-ic">عدد الأقساط</label>
                  <input id="w-ic" disabled value={INST_COUNT} readOnly /></div>
                <Month id="w-if" label={`موعد أول قسط${received ? ' · إجباري' : ''}`} value={d.pay.inst.first} onChange={(v) => setInst('first', v)}
                  disabled={!received} placeholder="يحدد بعد الاستلام" />
                <Month id="w-il2" label={`موعد آخر قسط${received ? ' · إجباري' : ''}`} value={d.pay.inst.last} onChange={(v) => setInst('last', v)}
                  disabled={!received} placeholder="يحدد بعد الاستلام" />
              </div>
              {b.inst && (
                <div className="inst-split">
                  <div className="paid-t"><span>مدفوعة</span><b><i className="num">{b.inst.paidN}</i> قسط · <i className="num">{money(b.inst.paid)}</i> ج</b></div>
                  <div className="rem-t"><span>متبقية</span><b><i className="num">{b.inst.leftN}</i> قسط · <i className="num">{money(b.inst.left)}</i> ج</b></div>
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
                <dt>إجمالي المتبقي</dt><dd><b className="num">{money(b.remaining)} ج</b>
                  {remItems.length > 0 && <ul className="rem-items">{remItems.map((t) => <li key={t}>{t}</li>)}</ul>}</dd>
              </dl></div>
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
