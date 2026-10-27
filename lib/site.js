export const SITE = {
  name: 'Golden Beit New Obour',
  arName: 'جولدن بيت',
  area: 'العبور الجديدة',
  zones: ['القادسية', 'الأمل'],
  ownership: ['مالك أصيل', 'توكيل'],
  phone: '01040333703',
  whatsapp: '201040333703',
  facebook: 'https://www.facebook.com/share/19uuKSkqqk/',
  email: 'info@goldenbeit.com',
};

export const money = (n) => Number(n || 0).toLocaleString('en');

export const listingCode = (id) => `GB-${id}`;

export const waLink = (text) =>
  `https://wa.me/${SITE.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

// Accounts are shared with the other Golden Beit platforms: the phone number is stored as
// p20XXXXXXXXXX@phone.goldenbeit.com, and email confirmation is off on the project.
export const PHONE_RE = /^01[0125]\d{8}$/;

export function normalizePhone(value) {
  let s = String(value || '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/\D/g, '');
  if (s.startsWith('0020')) s = s.slice(4);
  if (s.startsWith('20') && s.length === 12) s = '0' + s.slice(2);
  return s;
}

export const phoneToEmail = (phone) => `p20${phone.slice(1)}@phone.goldenbeit.com`;

export function emailToPhone(email) {
  const m = /^p20(\d{10})@phone\.goldenbeit\.com$/i.exec(email || '');
  return m ? '0' + m[1] : '';
}

export const userInfo = (user) =>
  user ? { name: user.user_metadata?.full_name || '', phone: emailToPhone(user.email) } : null;
