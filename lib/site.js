export const SITE = {
  name: 'Golden Beit New Obour',
  arName: 'جولدن بيت',
  governorate: 'العبور',
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

// المطلوب دفعه = المدفوع + الأوفر, المتبقي = السعر الكلي − المدفوع
export const dueOf = (x) => Number(x.paid || 0) + Number(x.over_amount || 0);
export const remainingOf = (x) => Math.max(0, Number(x.price || 0) - Number(x.paid || 0));
// Listings imported without a paid/over amount: المطلوب دفعه and المتبقي are unknown, not zero.
export const hasPayment = (x) => Number(x.paid || 0) > 0 || Number(x.over_amount || 0) > 0;
export const installmentsTotal =(inst) => Number(inst?.value || 0) * Number(inst?.count || 0);

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
  const p = x.pay || {}, rows = [];
  if (p.check) rows.push(['شيك التقنين', `${money(p.check)} ج`]);
  if (p.completion) rows.push(['دفعة الاستكمال', `${money(p.completion)} ج`]);
  if (p.inst) {
    const i = p.inst;
    if (i.value) rows.push(['قيمة القسط', `${money(i.value)} ج`]);
    if (i.count) rows.push(['عدد الأقساط', String(i.count)]);
    if (i.value && i.count) rows.push(['إجمالي الأقساط', `${money(installmentsTotal(i))} ج`]);
    if (i.left) rows.push(['الأقساط المتبقية', `${money(i.left)} ج`]);
    if (i.first) rows.push(['موعد أول قسط', i.first]);
    if (i.last) rows.push(['موعد آخر قسط', i.last]);
  }
  if (p.waiver) rows.push(['قيمة التنازل', `${money(p.waiver)} ج`]);
  if (Number(x.over_amount)) rows.push(['الأوفر المطلوب', `${money(x.over_amount)} ج`]);
  return rows;
}

const SERVER_ERRORS = {
  invalid_zone: 'اختار التقسيم: القادسية ولا الأمل.',
  invalid_status: 'اختار حالة القطعة.',
  invalid_price: 'اكتب السعر الكلي.',
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
