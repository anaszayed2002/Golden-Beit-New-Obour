# Golden Beit New Obour

منصة عرض أراضي القادسية والأمل في العبور الجديدة.

- `/` — الصفحة العامة: القطع المنشورة، فلتر وترتيب، تواصل واتساب، "اطلب القطعة"، و"اعرض قطعتك".
- `/admin` — لوحة الإدارة: موافقة/رفض الإعلانات، أرقام التليفونات، رقم القطعة، وطلبات القطع.

## التشغيل

```bash
npm install
npm run dev
```

## Supabase

بيستخدم بروجكت `golden-beit` (`gkkkfzaypfsqhvytqosp`). كل جداول المنصة دي بادئة بـ `nob_`
ومش بتلمس جداول المنصة التانية. الـ SQL في `supabase/migrations`.

- الحسابات مشتركة بين منصات جولدن بيت: رقم التليفون بيتخزن كإيميل `p20XXXXXXXXXX@phone.goldenbeit.com`.
- رقم القطعة وتليفون صاحب الإعلان في `nob_listing_private`، ومحدش بيقراهم غير الأدمن.
- أرقام الأدمن في `nob_admin_phones` (بصيغة `2010XXXXXXXX`).

متغيرات البيئة (اختيارية، فيه قيم افتراضية في `lib/supabase.js`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
