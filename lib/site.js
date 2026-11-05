export const SITE = {
  name: 'Golden Beit New Obour',
  arName: 'جولدن بيت',
  governorate: 'العبور الجديدة',
  zones: ['القادسية', 'الأمل'],
  phone: '01040333703',
  whatsapp: '201040333703',
  facebook: 'https://www.facebook.com/share/19uuKSkqqk/',
  email: 'info@goldenbeit.com',
};

// The order matters: land_status in the database is the 1-based index into this list.
export const STATUSES = [
  'على شيك التقنين',
  'ع الكشف (غير مدفوع الشيك)',
  'ع الكشف (مدفوع الشيك)',
  'مخصصة / غير مستكملة / غير مستلمة',
  'مخصصة / مستكملة / غير مستلمة',
  'مخصصة / مستلمة',
];
export const RECEIVED_STATUS = 6;
export const FACADES = ['بحري', 'قبلي', 'شرقي', 'غربي', 'ناصية'];
export const VIEWS = ['شارع رئيسي', 'حديقة', 'خدمات', 'داخلي'];
export const PAY_ITEMS = [
  ['check', 'شيك التقنين'],
  ['completion', 'دفعة الاستكمال'],
  ['inst', 'أقساط'],
  ['waiver', 'قيمة التنازل'],
];

export const statusLabel = (n) => STATUSES[n - 1] || '';
export const money = (n) => Number(n || 0).toLocaleString('en');
export const listingCode = (id) => `GB-${id}`;
export const areaOf = (x) => Number(x.area_final || x.area || x.area_orig || 0);

// ---------- Payment model (v5) ----------
// السعر الكلي = المطلوب دفعه + الأوفر.
// المطلوب دفعه = اللي البائع دفعه فعلاً: شيك التقنين (إلا لو الحالة "غير مدفوع الشيك") + الاستكمال لو اتدفع + الأقساط اللي عدّى ميعادها.
// المتبقي = اللي المشتري هيدفعه بعدين: قيمة التنازل + الشيك لو مش مدفوع + الاستكمال لو مش مدفوع + الأقساط اللي لسه.
export const WAIVER_PER_M = 180;
export const INST_COUNT = 3;
export const BUILD_YEARS = 5;
export const CHECK_UNPAID_STATUS = 2; // ع الكشف (غير مدفوع الشيك)
export const NOT_ALLOCATED = [2, 3]; // لسه مش مخصصة: الاستكمال بيروح للمتبقي
export const DISTRICTS = Array.from({ length: 37 }, (_, i) => `الحي ${i + 1}`);
export const NEIGHBORHOODS = Array.from({ length: 10 }, (_, i) => `المجاورة ${i + 1}`);

// شيك التقنين حسب المساحة بعد التقنين. Outside these ranges the seller types it.
export function checkByArea(a) {
  if (a >= 150 && a < 300) return 60000;
  if (a >= 300 && a < 450) return 100000;
  if (a >= 450 && a <= 500) return 150000;
  return null;
}

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const ymNum = (s) => (/^\d{4}-\d{2}$/.test(s || '') ? Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1 : null);
const ymStr = (n) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
const nowYm = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };
export const addYears = (s, y) => { const n = ymNum(s); return n == null ? '' : ymStr(n + 12 * y); };
export const fmtMonth = (s) => { const n = ymNum(s); return n == null ? '' : `${MONTHS[n % 12]} ${Math.floor(n / 12)}`; };
export const monthBefore = (a, b) => ymNum(a) != null && ymNum(b) != null && ymNum(a) < ymNum(b);

// Three installments spread evenly from the first to the last date.
export function instSchedule(first, last, count = INST_COUNT) {
  const f = ymNum(first), l = ymNum(last);
  if (f == null || l == null || l < f) return [];
  return Array.from({ length: count }, (_, i) => ymStr(Math.round(f + ((l - f) * i) / (count - 1))));
}

const hasLeftCount = (inst) => inst?.left_count != null && inst.left_count !== '';
export const installmentsTotal = (inst) => Number(inst?.value || 0) * Number(inst?.count || 0);
const legacyInstLeft = (inst) => (hasLeftCount(inst)
  ? Number(inst.value || 0) * Number(inst.left_count || 0) : Number(inst?.left || 0));

export function breakdown(x) {
  const p = x.pay || {};
  if (p.v !== 5) {
    // Older listings (the imported sheet): keep the stored numbers as they are.
    return { legacy: true, price: Number(x.price || 0), paid: Number(x.paid || 0), over: Number(x.over_amount || 0),
      remaining: legacyInstLeft(p.inst), inst: null };
  }
  const st = Number(x.land_status || 0), area = areaOf(x);
  const check = Number(p.check || 0), checkPaid = st !== CHECK_UNPAID_STATUS;
  const waiver = Math.round(area * WAIVER_PER_M);
  const comp = Number(p.completion || 0);
  const compPaid = comp > 0 && !!p.completion_paid && !NOT_ALLOCATED.includes(st);
  let inst = null;
  if (p.inst) {
    const value = Number(p.inst.value || 0);
    const sched = st === RECEIVED_STATUS ? instSchedule(p.inst.first, p.inst.last) : [];
    const now = nowYm();
    const paidN = sched.filter((m) => ymNum(m) <= now).length;
    inst = { value, count: INST_COUNT, paidN, leftN: INST_COUNT - paidN, paid: value * paidN, left: value * (INST_COUNT - paidN),
      sched, first: p.inst.first || '', last: p.inst.last || '' };
  }
  const paid = (checkPaid ? check : 0) + (compPaid ? comp : 0) + (inst ? inst.paid : 0);
  const remaining = waiver + (checkPaid ? 0 : check) + (comp && !compPaid ? comp : 0) + (inst ? inst.left : 0);
  const over = Number(x.over_amount || 0);
  return {
    price: paid + over, paid, over, remaining, check, checkPaid, waiver, comp, compPaid,
    compDue: comp && !compPaid ? p.completion_due || '' : '', inst,
    received: p.received || '', buildBy: p.received ? addYears(p.received, BUILD_YEARS) : '',
  };
}

export const remainingOf = (x) => breakdown(x).remaining;
export const dueOf = (x) => breakdown(x).paid;
// Imported listings without a paid amount: المطلوب دفعه is unknown, not zero.
export const hasPayment = (x) => breakdown(x).paid > 0;
export const instCountOf = (x) => Number(x.pay?.inst?.count || 0);
export const instValueOf = (x) => Number(x.pay?.inst?.value || 0);
export const instLeftCountOf = (x) => {
  const b = breakdown(x);
  if (b.inst) return b.inst.leftN;
  return hasLeftCount(x.pay?.inst) ? Number(x.pay.inst.left_count) : null;
};
// Zone is optional: fall back to the city.
export const placeOf = (x) => x.zone || SITE.governorate;

export const waLink = (text) =>
  `https://wa.me/${SITE.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const waTo = (phone) => `https://wa.me/2${phone}`;

export const toEnglishDigits = (value) => String(value ?? '')
  .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

// "GB-104", "gb104", "١٠٤" → 104
export function parseCode(value) {
  const m = toEnglishDigits(value).match(/\d+/);
  return m ? Number(m[0]) : null;
}

export const PHONE_RE = /^01[0125]\d{8}$/;

export function normalizePhone(value) {
  let s = toEnglishDigits(value).replace(/\D/g, '');
  if (s.startsWith('0020')) s = s.slice(4);
  if (s.startsWith('20') && s.length === 12) s = '0' + s.slice(2);
  return s;
}

// Admin accounts are shared with the other Golden Beit platforms: the phone number is stored as
// p20XXXXXXXXXX@phone.goldenbeit.com, and email confirmation is off on the project.
export const phoneToEmail = (phone) => `p20${phone.slice(1)}@phone.goldenbeit.com`;

export function emailToPhone(email) {
  const m = /^p20(\d{10})@phone\.goldenbeit\.com$/i.exec(email || '');
  return m ? '0' + m[1] : '';
}

export const userInfo = (user) =>
  user ? { name: user.user_metadata?.full_name || '', phone: emailToPhone(user.email) } : null;

// Payment items as label/value rows for display.
export function payRows(x) {
  const p = x.pay || {}, rows = [], b = breakdown(x), j = (n) => `${money(n)} ج`;
  if (!b.legacy) {
    if (b.check) rows.push(['شيك التقنين', `${j(b.check)} · ${b.checkPaid ? 'مدفوع' : 'على المشتري'}`]);
    if (b.comp) rows.push(['دفعة الاستكمال', `${j(b.comp)} · ${b.compPaid ? 'مدفوعة' : 'على المشتري'}`]);
    if (b.compDue) rows.push(['موعد الاستكمال', fmtMonth(b.compDue)]);
    if (b.inst) {
      const i = b.inst;
      rows.push(['قيمة القسط', j(i.value)]);
      rows.push(['عدد الأقساط', String(i.count)]);
      rows.push(['الأقساط المدفوعة', `${i.paidN} · ${j(i.paid)}`]);
      rows.push(['الأقساط المتبقية', `${i.leftN} · ${j(i.left)}`]);
      rows.push(['موعد أول قسط', i.sched.length ? fmtMonth(i.first) : 'يحدد بعد الاستلام']);
      rows.push(['موعد آخر قسط', i.sched.length ? fmtMonth(i.last) : 'يحدد بعد الاستلام']);
    }
    if (b.waiver) rows.push(['قيمة التنازل', `${j(b.waiver)} · على المشتري`]);
    return rows;
  }
  if (p.check) rows.push(['شيك التقنين', j(p.check)]);
  if (p.completion) rows.push(['دفعة الاستكمال', j(p.completion)]);
  if (p.inst) {
    const i = p.inst;
    if (i.value) rows.push(['قيمة القسط', j(i.value)]);
    if (i.count) rows.push(['عدد الأقساط', String(i.count)]);
    if (i.value && i.count) rows.push(['إجمالي الأقساط', j(installmentsTotal(i))]);
    if (hasLeftCount(i)) rows.push(['عدد الأقساط المتبقية', String(i.left_count)]);
    if (legacyInstLeft(i)) rows.push(['إجمالي الأقساط المتبقية', j(legacyInstLeft(i))]);
    if (i.first) rows.push(['موعد أول قسط', i.first]);
    if (i.last) rows.push(['موعد آخر قسط', i.last]);
  }
  if (p.waiver) rows.push(['قيمة التنازل', j(p.waiver)]);
  if (Number(x.over_amount)) rows.push(['الأوفر المطلوب', j(x.over_amount)]);
  return rows;
}

// مسار التسليم والبناء
export function deliveryRows(x) {
  const b = breakdown(x);
  if (b.legacy || !b.received) return [];
  return [['تاريخ الاستلام', fmtMonth(b.received)], ['تنتهي مهلة البناء في', fmtMonth(b.buildBy)]];
}

const SERVER_ERRORS = {
  invalid_zone: 'التقسيم لازم يكون القادسية أو الأمل أو فاضي.',
  invalid_status: 'اختار حالة القطعة.',
  invalid_price: 'اكتب الأوفر أو اختار البنود المدفوعة، علشان السعر الكلي يتحسب.',
  invalid_area: 'اكتب المساحة.',
  paid_over_price: 'المدفوع أكبر من السعر الكلي. راجع الأرقام.',
  invalid_phone: 'اكتب رقم موبايل مصري صح، زي 01012345678.',
  invalid_name: 'اكتب الاسم.',
  field_too_long: 'فيه خانة مكتوب فيها كلام كتير. اختصره شوية.',
  too_many_offers: 'بعت إعلانات كتير النهارده من الرقم ده. جرب بكرة أو كلمنا على واتساب.',
  too_many_requests: 'بعت طلبات كتير النهارده. كلمنا على واتساب.',
  listing_not_found: 'القطعة دي مش متاحة دلوقتي.',
  busy: 'فيه ضغط على الموقع دلوقتي. جرب كمان شوية.',
};
export function serverError(error, fallback = 'حصلت مشكلة. جرب تاني بعد شوية.') {
  const m = error?.message || '';
  const key = Object.keys(SERVER_ERRORS).find((k) => m.includes(k));
  return key ? SERVER_ERRORS[key] : fallback;
}
