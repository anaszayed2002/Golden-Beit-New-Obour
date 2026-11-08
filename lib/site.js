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
// Amounts are rounded to one decimal place.
export const r1 = (n) => Math.round(Number(n || 0) * 10) / 10;
export const money = (n) => r1(n).toLocaleString('en', { maximumFractionDigits: 1 });
// Unit code: zone letter + year/month listed + completed or not + number, e.g. Q2611C-261.
// Q = القادسية، A = الأمل، O = العبور الجديدة (من غير تقسيم). C = مستكملة (مستكملة أو مستلمة)، N = غير مستكملة.
export const ZONE_CODES = { 'القادسية': 'Q', 'الأمل': 'A' };
export function listingCode(x) {
  if (x == null || typeof x !== 'object') return `GB-${x}`;
  const z = ZONE_CODES[x.zone] || 'O';
  const d = x.created_at ? new Date(x.created_at) : new Date();
  const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const done = Number(x.land_status) >= 5 ? 'C' : 'N';
  return `${z}${ym}${done}-${x.id}`;
}
export const areaOf = (x) => Number(x.area_final || x.area || x.area_orig || 0);

// ---------- Payment model (v5) ----------
// السعر الكلي = المطلوب دفعه + الأوفر.
// المطلوب دفعه = اللي البائع دفعه فعلاً: شيك التقنين (إلا لو الحالة "غير مدفوع الشيك") + الاستكمال لو اتدفع + الأقساط اللي عدّى ميعادها.
// المتبقي = اللي المشتري هيدفعه بعدين: قيمة التنازل + الشيك لو مش مدفوع + الاستكمال لو مش مدفوع + الأقساط اللي لسه.
export const WAIVER_PER_M = 180;
export const INST_COUNT = 3;
export const BUILD_YEARS = 5;
export const CHECK_UNPAID_STATUS = 2; // ع الكشف (غير مدفوع الشيك)
export const NOT_ALLOCATED = [2, 3]; // لسه مش مخصصة
export const COMPLETED_STATUS = 5; // من "مخصصة / مستكملة" وطالع: الاستكمال مدفوع
// Districts of each zone; picking a district sets its zone.
export const ZONE_DISTRICTS = {
  'القادسية': [8, 9, 10, 12, 17, 20, 21, 22, 23].map((n) => `الحي ${n}`),
  'الأمل': [28, 29, 30, 32, 33, 34, 35, 36].map((n) => `الحي ${n}`),
};
export const DISTRICTS = Object.values(ZONE_DISTRICTS).flat();
export const zoneOfDistrict = (dist) => Object.keys(ZONE_DISTRICTS).find((z) => ZONE_DISTRICTS[z].includes(dist)) || '';
export const NEIGHBORHOODS = Array.from({ length: 10 }, (_, i) => `المجاورة ${i + 1}`);

// ---------- Legalization from أصل المساحة (guide prices; the city authority sets the final ones) ----------
export const PRICE_NOTE = 'هذه الأسعار استرشادية لمساعدتك في ضبط ميزانيتك، والأسعار النهائية تُحدَّد من القسم المختص بجهاز مدينة العبور الجديدة.';
export const LEGAL = {
  minArea: 150,
  autoBelow: 500,            // TODO(مؤجل): rules for 500 م² and above
  roadCut: (a) => (a <= 300 ? 0.15 : 0.2), // 15% up to 300 م²، 20% above
  pricePerM: (a) => (a <= 345 ? 1200 : 1400), // 1,400 "تُراجع"
  buyPerM: 3000,             // buying missing meters from the authority
  sellPerM: 700,             // selling extra meters to the authority
  adminFee: 0.015,
  tiers: [209, 276, 300, 350, 400, 450, 500],
};

// شيك التقنين حسب أصل المساحة.
export function checkFor(a) {
  if (!(a >= LEGAL.minArea)) return null;
  if (a < 350) return 60000;
  if (a < 500) return 100000;
  return 150000;
}
// Kept for older code paths: same rule.
export const checkByArea = checkFor;

// The full calculation, column by column like the authority sheet. tierPick: chosen tier when two are close.
export function legalCalc(a, tierPick) {
  a = Number(a);
  if (!(a >= LEGAL.minArea && a < LEGAL.autoBelow)) return null;
  const cutPct = LEGAL.roadCut(a);
  const cut = r1(a * cutPct);
  const net = r1(a - cut);
  const up = LEGAL.tiers.find((t) => t >= net);
  const down = [...LEGAL.tiers].reverse().find((t) => t <= net);
  let options = [];
  let tier;
  if (up == null) tier = down;
  else if (down == null || up === net) tier = up;
  else {
    const dUp = up - net, dDown = net - down;
    tier = dUp <= dDown ? up : down;
    // Between two tiers the seller always chooses: the one below (sell the extra) or above (buy the missing).
    options = [down, up];
  }
  // The seller can move to any tier (slider); the cost of buying/selling meters follows the chosen tier.
  if (LEGAL.tiers.includes(Number(tierPick))) tier = Number(tierPick);
  const perM = LEGAL.pricePerM(a);
  const legal = r1(net * perM);
  const missing = r1(Math.max(0, tier - net)), extra = r1(Math.max(0, net - tier));
  const meters = r1(missing * LEGAL.buyPerM - extra * LEGAL.sellPerM);
  const total = r1(legal + meters);
  const admin = r1(total * LEGAL.adminFee);
  const grand = r1(total + admin);
  const quarter = r1(grand / 4);
  const check = checkFor(a);
  return {
    a, cutPct, cut, net, tier, options, perM, legal, missing, extra, meters, total, admin, grand, quarter,
    check, completion: r1(quarter - check), instValue: quarter, waiver: r1(tier * WAIVER_PER_M),
  };
}
// Approximate أصل المساحة that lands nearest to a tier (inverse of the road cut). { from, to } in م²; to is null for the top tier.
export function origRangeFor(tier) {
  const tiers = LEGAL.tiers, i = tiers.indexOf(Number(tier));
  if (i < 0) return null;
  const cutAt = 300 * (1 - LEGAL.roadCut(300)); // net of a 300 م² plot
  const toA = (n) => (n <= cutAt ? n / (1 - LEGAL.roadCut(300)) : n / (1 - LEGAL.roadCut(301)));
  const lo = i > 0 ? toA((tiers[i - 1] + tiers[i]) / 2) : LEGAL.minArea;
  const hi = i < tiers.length - 1 ? toA((tiers[i] + tiers[i + 1]) / 2) : null;
  return { from: Math.max(LEGAL.minArea, Math.round(lo)), to: hi == null ? null : Math.round(hi) };
}
// Up to 4 decimals, no rounding to whole pounds.
export const exact = (n) => money(n);

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
  const waiver = p.waiver ? Math.round(area * WAIVER_PER_M) : 0;
  const comp = Number(p.completion || 0);
  // The status decides it: مستكملة or مستلمة means the completion payment is already paid.
  const compPaid = comp > 0 && st >= COMPLETED_STATUS;
  let inst = null;
  if (p.inst) {
    const value = Number(p.inst.value || 0);
    const sched = st === RECEIVED_STATUS ? instSchedule(p.inst.first, p.inst.last) : [];
    const now = nowYm();
    const paidN = sched.filter((m) => ymNum(m) <= now).length;
    inst = { value, count: INST_COUNT, paidN, leftN: INST_COUNT - paidN, paid: value * paidN, left: value * (INST_COUNT - paidN),
      sched, first: p.inst.first || '', last: p.inst.last || '' };
  }
  // actual = what the seller already paid; paid (المطلوب دفعه) = actual + الأوفر; السعر الكلي = المطلوب دفعه + المتبقي.
  const actual = (checkPaid ? check : 0) + (compPaid ? comp : 0) + (inst ? inst.paid : 0);
  const remaining = waiver + (checkPaid ? 0 : check) + (comp && !compPaid ? comp : 0) + (inst ? inst.left : 0);
  const over = Number(x.over_amount || 0);
  const paid = actual + over;
  return {
    price: paid + remaining, paid, actual, over, remaining, check, checkPaid, waiver, comp, compPaid,
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

// "Q2611C-261", "GB-104", "١٠٤" → the listing number, which is always the last group of digits.
export function parseCode(value) {
  const m = toEnglishDigits(value).match(/\d+/g);
  return m ? Number(m[m.length - 1]) : null;
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
  const p = x.pay || {}, rows = [], b = breakdown(x), j = (n) => `${money(n)} ج.م`;
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
    if (b.waiver) rows.push(['مصاريف التنازل', `${j(b.waiver)} · على المشتري`]);
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
  photo_required: 'ارفع صورة القطعة أو الخريطة الأول.',
  invalid_photo: 'الصورة مش سليمة. ارفعها تاني.',
};
export function serverError(error, fallback = 'حصلت مشكلة. جرب تاني بعد شوية.') {
  const m = error?.message || '';
  const key = Object.keys(SERVER_ERRORS).find((k) => m.includes(k));
  return key ? SERVER_ERRORS[key] : fallback;
}
