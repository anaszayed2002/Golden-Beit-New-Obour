'use client';
import { useRef, useState } from 'react';
import {
  SITE, STATUSES, FACADES, VIEWS, PAY_ITEMS, PHONE_RE, money, listingCode,
  dueOf, remainingOf, installmentsTotal, normalizePhone, toEnglishDigits, statusLabel,
} from '@/lib/site';
import SheetTop from './SheetTop';

const STEP_NAMES = ['المكان', 'المساحة والحالة', 'مميزات القطعة', 'السعر والدفع', 'البيانات'];

const blank = () => ({
  zone: '', district: '', neighborhood: '', block: '', plot_number: '',
  area_orig: '', area_final: '', land_status: 0, facade: '', view_type: '',
  price: '', paid: '', over_amount: '', pay: { inst: {} }, payOn: {},
  description: '', owner_name: '', contact_phone: '',
});

function fromListing(x) {
  const pay = { inst: {}, ...(x.pay || {}) };
  return {
    ...blank(),
    zone: x.zone || '', district: x.district || '', neighborhood: x.neighborhood || '',
    block: x.block || '', plot_number: x.plot_number || '',
    area_orig: x.area_orig ?? x.area ?? '', area_final: x.area_final ?? x.area ?? '',
    land_status: x.land_status || 0, facade: x.facade || '', view_type: x.view_type || '',
    price: x.price ?? '', paid: x.paid ?? '', over_amount: x.over_amount || '',
    pay, payOn: { check: !!pay.check, completion: !!pay.completion, inst: !!x.pay?.inst, waiver: !!pay.waiver },
    description: x.description || '', owner_name: x.owner_name || '', contact_phone: x.contact_phone || '',
  };
}

const num = (v) => (v === '' || v == null ? '' : Number(toEnglishDigits(v)));

function toPayload(d) {
  const pay = {};
  if (d.payOn.check && d.pay.check) pay.check = num(d.pay.check);
  if (d.payOn.completion && d.pay.completion) pay.completion = num(d.pay.completion);
  if (d.payOn.waiver && d.pay.waiver) pay.waiver = num(d.pay.waiver);
  if (d.payOn.inst) {
    const i = d.pay.inst || {};
    pay.inst = { value: num(i.value), count: num(i.count), left: num(i.left), first: i.first || '', last: i.last || '' };
  }
  return {
    zone: d.zone, district: d.district.trim(), neighborhood: d.neighborhood.trim(), block: d.block.trim(),
    plot_number: d.plot_number.trim(), area_orig: num(d.area_orig), area_final: num(d.area_final),
    land_status: d.land_status, facade: d.facade, view_type: d.view_type,
    price: num(d.price), paid: num(d.paid) || 0, over_amount: num(d.over_amount) || 0, pay,
    description: d.description.trim(), owner_name: d.owner_name.trim(), contact_phone: normalizePhone(d.contact_phone),
  };
}

function validate(step, d) {
  if (step === 0 && !d.zone) return 'اختار التقسيم: القادسية ولا الأمل.';
  if (step === 1 && !(num(d.area_final) > 0 || num(d.area_orig) > 0)) return 'اكتب المساحة.';
  if (step === 1 && !d.land_status) return 'اختار حالة القطعة.';
  if (step === 3 && !(num(d.price) > 0)) return 'اكتب السعر الكلي.';
  if (step === 3 && num(d.paid) > num(d.price)) return 'المدفوع أكبر من السعر الكلي. راجع الأرقام.';
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

function Money({ id, label, value, onChange }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" inputMode="numeric" min="0" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="hint num">{value ? `${money(num(value))} ج` : ''}</span>
    </div>
  );
}

// mode: 'public' (visitor offer) | 'admin' (add or edit). onSubmit(payload) resolves to an error message or ''.
export default function ListingWizard({ mode = 'public', initial, editId, onClose, onSubmit, suggestions = {} }) {
  const admin = mode === 'admin';
  const [d, setD] = useState(() => (initial ? fromListing(initial) : blank()));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sheet = useRef(null);

  const set = (k, v) => setD((s) => ({ ...s, [k]: v }));
  const setPay = (k, v) => setD((s) => ({ ...s, pay: { ...s.pay, [k]: v } }));
  const setInst = (k, v) => setD((s) => ({ ...s, pay: { ...s.pay, inst: { ...(s.pay.inst || {}), [k]: v } } }));
  const togglePay = (k) => setD((s) => ({ ...s, payOn: { ...s.payOn, [k]: !s.payOn[k] } }));
  const go = (n) => { setError(''); setStep(n); sheet.current?.scrollTo({ top: 0 }); };

  const totals = { price: num(d.price) || 0, paid: num(d.paid) || 0, over_amount: num(d.over_amount) || 0 };
  const title = admin ? (editId ? `تعديل ${listingCode(editId)}` : 'إضافة إعلان') : 'اعرض قطعتك';
  const last = step === STEP_NAMES.length - 1;

  async function next(e) {
    e.preventDefault();
    const err = validate(step, d);
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
            <div className="field full"><span className="lbl">التقسيم (الجمعية)</span>
              <div className="big-choice">
                {SITE.zones.map((z) => <button key={z} type="button" aria-pressed={d.zone === z} onClick={() => set('zone', z)}>{z}</button>)}
              </div></div>
            <div className="field"><label htmlFor="w-dist">الحي</label>
              <input id="w-dist" list="dl-dist" maxLength={40} placeholder="مثلاً الحي الأول" value={d.district} onChange={(e) => set('district', e.target.value)} /></div>
            <div className="field"><label htmlFor="w-nb">المجاورة</label>
              <input id="w-nb" list="dl-nb" maxLength={40} placeholder="مثلاً المجاورة 3" value={d.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></div>
            <div className="field"><label htmlFor="w-block">البلوك</label>
              <input id="w-block" maxLength={40} value={d.block} onChange={(e) => set('block', e.target.value)} /></div>
            <div className="field"><label htmlFor="w-plot">رقم القطعة (لو موجود)</label>
              <input id="w-plot" maxLength={40} placeholder="سيبه فاضي لو لسه متخصصتش" value={d.plot_number} onChange={(e) => set('plot_number', e.target.value)} /></div>
            <datalist id="dl-dist">{(suggestions.districts || []).map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="dl-nb">{(suggestions.neighborhoods || []).map((v) => <option key={v} value={v} />)}</datalist>
          </div>
        )}

        {step === 1 && (
          <div className="grid">
            <div className="field"><label htmlFor="w-ao">أصل المساحة (م²)</label>
              <input id="w-ao" type="number" inputMode="decimal" min="0" value={d.area_orig} onChange={(e) => set('area_orig', e.target.value)} /></div>
            <div className="field"><label htmlFor="w-af">المساحة بعد التقنين (م²)</label>
              <input id="w-af" type="number" inputMode="decimal" min="0" value={d.area_final} onChange={(e) => set('area_final', e.target.value)} /></div>
            <div className="field full"><label htmlFor="w-status">الحالة</label>
              <select id="w-status" value={d.land_status || ''} onChange={(e) => set('land_status', Number(e.target.value) || 0)}>
                <option value="">اختار الحالة</option>
                {STATUSES.map((t, i) => <option key={t} value={i + 1}>{t}</option>)}
              </select></div>
          </div>
        )}

        {step === 2 && (
          <div className="grid">
            <div className="field full"><span className="lbl">الواجهة</span><Chips options={FACADES} value={d.facade} onPick={(v) => set('facade', v)} /></div>
            <div className="field full"><span className="lbl">الإطلالة</span><Chips options={VIEWS} value={d.view_type} onPick={(v) => set('view_type', v)} /></div>
          </div>
        )}

        {step === 3 && (
          <div className="grid">
            <div className="full"><Money id="w-price" label="السعر الكلي (جنيه)" value={d.price} onChange={(v) => set('price', v)} /></div>
            <Money id="w-paid" label="المدفوع (جنيه)" value={d.paid} onChange={(v) => set('paid', v)} />
            <Money id="w-over" label="الأوفر المطلوب (جنيه)" value={d.over_amount} onChange={(v) => set('over_amount', v)} />
            <div className="full calc">
              <div><label>المطلوب دفعه</label><strong className="num">{money(dueOf(totals))} ج</strong></div>
              <div><label>المتبقي</label><strong className="num">{money(remainingOf(totals))} ج</strong></div>
            </div>
            <div className="field full"><span className="lbl">بنود الدفع (اختار اللي يخصك)</span>
              <div className="chips toggle">
                {PAY_ITEMS.map(([k, t]) => <button key={k} type="button" aria-pressed={!!d.payOn[k]} onClick={() => togglePay(k)}>{t}</button>)}
              </div></div>
            {d.payOn.check && <div className="full paybox"><Money id="w-check" label="شيك التقنين (جنيه)" value={d.pay.check ?? ''} onChange={(v) => setPay('check', v)} /></div>}
            {d.payOn.completion && <div className="full paybox"><Money id="w-comp" label="دفعة الاستكمال (جنيه)" value={d.pay.completion ?? ''} onChange={(v) => setPay('completion', v)} /></div>}
            {d.payOn.inst && (
              <div className="full paybox">
                <h4>الأقساط</h4>
                <div className="grid">
                  <Money id="w-iv" label="قيمة القسط" value={d.pay.inst?.value ?? ''} onChange={(v) => setInst('value', v)} />
                  <div className="field"><label htmlFor="w-ic">عدد الأقساط</label>
                    <input id="w-ic" type="number" inputMode="numeric" min="0" value={d.pay.inst?.count ?? ''} onChange={(e) => setInst('count', e.target.value)} /></div>
                  <div className="full calc one"><div><label>إجمالي الأقساط</label><strong className="num">{money(installmentsTotal({ value: num(d.pay.inst?.value), count: num(d.pay.inst?.count) }))} ج</strong></div></div>
                  <div className="full"><Money id="w-il" label="إجمالي الأقساط المتبقية" value={d.pay.inst?.left ?? ''} onChange={(v) => setInst('left', v)} /></div>
                  <div className="field"><label htmlFor="w-if">موعد أول قسط</label>
                    <input id="w-if" type="month" value={d.pay.inst?.first || ''} onChange={(e) => setInst('first', e.target.value)} /></div>
                  <div className="field"><label htmlFor="w-il2">موعد آخر قسط</label>
                    <input id="w-il2" type="month" value={d.pay.inst?.last || ''} onChange={(e) => setInst('last', e.target.value)} /></div>
                </div>
              </div>
            )}
            {d.payOn.waiver && <div className="full paybox"><Money id="w-wv" label="قيمة التنازل (جنيه)" value={d.pay.waiver ?? ''} onChange={(v) => setPay('waiver', v)} /></div>}
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
                <dt>المساحة</dt><dd><span className="num">{d.area_final || d.area_orig}</span> م²</dd>
                <dt>الحالة</dt><dd>{statusLabel(d.land_status)}</dd>
                <dt>السعر الكلي</dt><dd className="num">{money(num(d.price))} ج</dd>
                <dt>المطلوب دفعه</dt><dd className="num">{money(dueOf(totals))} ج</dd>
                <dt>المتبقي</dt><dd className="num">{money(remainingOf(totals))} ج</dd>
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
