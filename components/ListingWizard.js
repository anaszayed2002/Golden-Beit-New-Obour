'use client';
import { useRef, useState } from 'react';
import {
  SITE, STATUSES, FACADES, VIEWS, PHONE_RE, RECEIVED_STATUS, WAIVER_PER_M, DISTRICTS, NEIGHBORHOODS,
  INST_COUNT, BUILD_YEARS, CHECK_UNPAID_STATUS, NOT_ALLOCATED,
  money, listingCode, normalizePhone, toEnglishDigits, statusLabel,
  breakdown, checkByArea, addYears, fmtMonth, monthBefore,
} from '@/lib/site';
import SheetTop from './SheetTop';

const STEP_NAMES = ['المكان', 'المساحة والحالة', 'مميزات القطعة', 'السعر والدفع', 'البيانات'];
const PAY_CHOICES = [['check', 'شيك التقنين'], ['inst', 'الأقساط'], ['completion', 'دفعة الاستكمال'], ['waiver', 'مصاريف التنازل']];

const blank = () => ({
  zone: '', district: '', neighborhood: '', block: '', plot_number: '',
  area_orig: '', area_final: '', land_status: 0, facade: '', view_type: '', received: '',
  over_amount: '', check_manual: '', payOn: {},
  pay: { completion: '', completion_paid: false, completion_due: '', inst: { value: '', first: '', last: '' } },
  description: '', owner_name: '', contact_phone: '',
});

function fromListing(x) {
  const p = x.pay || {};
  const v5 = p.v === 5;
  const area = Number(x.area_final || x.area || x.area_orig || 0);
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
    check_manual: p.check && checkByArea(area) == null ? p.check : '',
    payOn: { check: !!p.check, waiver: !!p.waiver, completion: !!p.completion, inst: !!p.inst },
    pay: {
      completion: p.completion || '', completion_paid: !!p.completion_paid, completion_due: p.completion_due || '',
      inst: { value: p.inst?.value || '', first: p.inst?.first || '', last: p.inst?.last || '' },
    },
    description: x.description || '', owner_name: x.owner_name || '', contact_phone: x.contact_phone || '',
  };
}

const num = (v) => (v === '' || v == null ? '' : Number(toEnglishDigits(v)));
const areaIn = (d) => num(d.area_final) || num(d.area_orig) || 0;

// The listing as it will be saved; breakdown() works out every automatic box from it.
function asListing(d) {
  const received = d.land_status === RECEIVED_STATUS;
  const area = areaIn(d);
  const pay = { v: 5 };
  if (d.payOn.check) pay.check = checkByArea(area) ?? (num(d.check_manual) || 0);
  if (d.payOn.waiver) pay.waiver = Math.round(area * WAIVER_PER_M);
  if (received && d.received) pay.received = d.received;
  if (d.payOn.completion) {
    const paid = !!d.pay.completion_paid && !NOT_ALLOCATED.includes(d.land_status);
    pay.completion = num(d.pay.completion) || 0;
    pay.completion_paid = paid;
    if (!paid && d.pay.completion_due) pay.completion_due = d.pay.completion_due;
  }
  if (d.payOn.inst) {
    pay.inst = { value: num(d.pay.inst.value) || 0, count: INST_COUNT };
    if (received) { pay.inst.first = d.pay.inst.first || ''; pay.inst.last = d.pay.inst.last || ''; }
  }
  return { land_status: d.land_status, area_final: num(d.area_final), area_orig: num(d.area_orig), over_amount: num(d.over_amount) || 0, pay };
}

function toPayload(d) {
  const l = asListing(d), b = breakdown(l);
  return {
    zone: d.zone, district: d.district.trim(), neighborhood: d.neighborhood.trim(), block: d.block.trim(),
    plot_number: d.plot_number.trim(), area_orig: num(d.area_orig), area_final: num(d.area_final),
    land_status: d.land_status, facade: d.facade, view_type: d.view_type,
    price: b.price, paid: b.paid, over_amount: b.over, pay: l.pay,
    description: d.description.trim(), owner_name: d.owner_name.trim(), contact_phone: normalizePhone(d.contact_phone),
  };
}

function validate(step, d) {
  const received = d.land_status === RECEIVED_STATUS;
  if (step === 1 && !(num(d.area_final) > 0 || num(d.area_orig) > 0)) return 'اكتب المساحة.';
  if (step === 1 && !d.land_status) return 'اختار حالة القطعة.';
  if (step === 1 && received && !d.received) return 'اختار تاريخ الاستلام (الشهر والسنة).';
  if (step === 3) {
    if (d.payOn.inst && !(num(d.pay.inst.value) > 0)) return 'اكتب قيمة القسط.';
    if (d.payOn.inst && received && (!d.pay.inst.first || !d.pay.inst.last)) return 'القطعة مستلمة: اختار موعد أول قسط وآخر قسط.';
    if (d.payOn.inst && received && monthBefore(d.pay.inst.last, d.pay.inst.first)) return 'موعد آخر قسط لازم يكون بعد أول قسط.';
    if (d.payOn.completion && !(num(d.pay.completion) > 0)) return 'اكتب قيمة دفعة الاستكمال.';
    if (!(breakdown(asListing(d)).price > 0)) return 'اكتب الأوفر أو البنود المدفوعة، علشان السعر الكلي يتحسب.';
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
function Auto({ label, value, empty, note, count, text, full }) {
  const shown = text ?? (count ? (value === '' || value == null ? '' : String(value)) : value ? <><span className="num">{money(value)}</span> ج</> : '');
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <span className="lbl">{label} <small className="auto-tag">(يحدد تلقائيا)</small></span>
      <div className={`autobox${shown ? '' : ' empty'}`}>{shown || empty || (count ? '0' : '0 ج')}</div>
      {note && <span className="hint">{note}</span>}
    </div>
  );
}

function Money({ id, label, value, onChange, full }) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" inputMode="numeric" min="0" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="hint num">{value ? `${money(num(value))} ج` : ''}</span>
    </div>
  );
}

function Month({ id, label, value, onChange, disabled, placeholder }) {
  return (
    <div className="field"><label htmlFor={id}>{label}</label>
      {disabled
        ? <input id={id} disabled placeholder={placeholder} />
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

  const set = (k, v) => setD((s) => ({ ...s, [k]: v }));
  const setPay = (k, v) => setD((s) => ({ ...s, pay: { ...s.pay, [k]: v } }));
  const setInst = (k, v) => setD((s) => ({ ...s, pay: { ...s.pay, inst: { ...s.pay.inst, [k]: v } } }));
  const togglePay = (k) => setD((s) => ({ ...s, payOn: { ...s.payOn, [k]: !s.payOn[k] } }));
  const go = (n) => { setError(''); setStep(n); sheet.current?.scrollTo({ top: 0 }); };

  const b = breakdown(asListing(d));
  const area = areaIn(d);
  const received = d.land_status === RECEIVED_STATUS;
  const checkUnpaid = d.land_status === CHECK_UNPAID_STATUS;
  const notAllocated = NOT_ALLOCATED.includes(d.land_status);
  const checkTier = checkByArea(area);
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
              <input id="w-ao" type="number" inputMode="decimal" min="0" value={d.area_orig} onChange={(e) => set('area_orig', e.target.value)} /></div>
            <div className="field"><label htmlFor="w-af">المساحة بعد التقنين (م²)</label>
              <input id="w-af" type="number" inputMode="decimal" min="0" value={d.area_final} onChange={(e) => set('area_final', e.target.value)} /></div>
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
          </div>
        )}

        {step === 3 && (
          <div className="grid">
            <Auto full label="السعر الكلي" value={b.price} note="المطلوب دفعه + الأوفر" />
            <Auto full label="المطلوب دفعه (المبلغ الذي دفعته فعلياً + شيك التقنين)" value={b.paid}
              empty="فضلا اختر البنود المدفوعة بالأسفل" />
            <Money full id="w-over" label="الأوفر المطلوب (جنيه)" value={d.over_amount} onChange={(v) => set('over_amount', v)} />
            <Auto full label="المتبقي" value={b.remaining} note="المطلوب دفعه ولكن لا يدفع (يدفعه المشتري لاحقاً)" />

            <div className="field full"><span className="lbl sec-lbl">البنود المدفوعة (اختار اللي يخصك)</span>
              <div className="chips toggle">
                {PAY_CHOICES.map(([k, t]) => <button key={k} type="button" aria-pressed={!!d.payOn[k]} onClick={() => togglePay(k)}>{t}</button>)}
              </div></div>

            {d.payOn.check && (<div className="full paybox">
              {checkTier != null || !area
                ? <Auto label="شيك التقنين" value={b.check} empty="اكتب المساحة في الخطوة التانية" />
                : <Money id="w-check" label="شيك التقنين (المساحة خارج الشرايح، اكتب القيمة)" value={d.check_manual} onChange={(v) => set('check_manual', v)} />}
              <p className="paynote">{checkUnpaid ? 'الشيك مش مدفوع، فبيتضاف على المتبقي.' : 'بيتضاف على المطلوب دفعه.'}</p>
            </div>)}

            {d.payOn.waiver && (<div className="full paybox">
              <Auto label="مصاريف التنازل" value={b.waiver} empty="اكتب المساحة في الخطوة التانية" note={`${WAIVER_PER_M} ج × المساحة بعد التقنين`} />
              <p className="paynote">بتتضاف على المتبقي.</p>
            </div>)}

            {d.payOn.completion && (
              <div className="full paybox">
                <h4>دفعة الاستكمال</h4>
                <div className="grid">
                  <Money full id="w-comp" label="قيمة الاستكمال (جنيه)" value={d.pay.completion} onChange={(v) => setPay('completion', v)} />
                  {notAllocated
                    ? <p className="paynote full">القطعة لسه مش مخصصة، فالاستكمال بيتضاف على المتبقي.</p>
                    : <label className="chk full"><input type="checkbox" checked={!!d.pay.completion_paid} onChange={(e) => setPay('completion_paid', e.target.checked)} /> دفعت الاستكمال</label>}
                  {(notAllocated || !d.pay.completion_paid) && (
                    <Month id="w-compdue" label="موعد الاستكمال" value={d.pay.completion_due} onChange={(v) => setPay('completion_due', v)} />
                  )}
                </div>
                <p className="paynote">{b.compPaid ? 'بتتضاف على المطلوب دفعه.' : 'بتتضاف على المتبقي.'}</p>
              </div>
            )}

            {d.payOn.inst && (
              <div className="full paybox">
                <h4>الأقساط المدفوعة / المتبقية</h4>
                <div className="grid">
                  <Money id="w-iv" label="قيمة القسط" value={d.pay.inst.value} onChange={(v) => setInst('value', v)} />
                  <div className="field"><label htmlFor="w-ic">عدد الأقساط</label>
                    <input id="w-ic" disabled value={INST_COUNT} readOnly /></div>
                  <Month id="w-if" label={`موعد أول قسط${received ? ' (إجباري)' : ''}`} value={d.pay.inst.first} onChange={(v) => setInst('first', v)}
                    disabled={!received} placeholder="يحدد بعد الاستلام" />
                  <Month id="w-il2" label={`موعد آخر قسط${received ? ' (إجباري)' : ''}`} value={d.pay.inst.last} onChange={(v) => setInst('last', v)}
                    disabled={!received} placeholder="يحدد بعد الاستلام" />
                  <Auto count label="عدد الأقساط المدفوعة" value={b.inst?.paidN ?? 0} />
                  <Auto label="إجمالي الأقساط المدفوعة" value={b.inst?.paid} />
                  <Auto count label="عدد الأقساط المتبقية" value={b.inst?.leftN ?? INST_COUNT} />
                  <Auto label="إجمالي الأقساط المتبقية" value={b.inst?.left} />
                </div>
                <p className="paynote">{received
                  ? 'الأقساط اللي عدّى ميعادها بتتضاف على المطلوب دفعه، والباقي على المتبقي.'
                  : 'القطعة مش مستلمة، فإجمالي الأقساط كله بيتضاف على المتبقي.'}</p>
              </div>
            )}
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
                {received && d.received && (<><dt>تاريخ الاستلام</dt><dd>{fmtMonth(d.received)}</dd></>)}
                <dt>السعر الكلي</dt><dd className="num">{money(b.price)} ج</dd>
                <dt>المطلوب دفعه</dt><dd className="num">{money(b.paid)} ج</dd>
                <dt>الأوفر</dt><dd className="num">{money(b.over)} ج</dd>
                <dt>المتبقي</dt><dd className="num">{money(b.remaining)} ج</dd>
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
