import { SITE, waLink } from '@/lib/site';
import { ChatIcon, PhoneIcon, FacebookIcon, MailIcon } from './icons';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap fgrid">
        <div className="flogo"><img src="/logo.png" alt="جولدن بيت Golden Beit" /></div>
        <div className="contacts">
          <a href={waLink()} target="_blank" rel="noopener noreferrer">
            <ChatIcon /><span className="num">{SITE.phone}</span>&nbsp;· واتساب
          </a>
          <a href={`tel:${SITE.phone}`}><PhoneIcon /><span className="num">{SITE.phone}</span></a>
          <a href={SITE.facebook} target="_blank" rel="noopener noreferrer"><FacebookIcon />فيسبوك</a>
          <a href={`mailto:${SITE.email}`}><MailIcon /><span className="num">{SITE.email}</span></a>
        </div>
        <p className="disclaimer">
          <b>تنويه:</b> منصة &apos;جولدن بيت&apos; هي منصة عقارية وسيطة ومستقلة. الموقع غير تابع لهيئة المجتمعات العمرانية أو أي جهة رسمية أخرى. جميع الوحدات المعروضة هي مسؤولية أصحابها من الأفراد أو الشركات، ودورنا هو الربط بين البائع والمشتري والمستأجر.
        </p>
        <div className="copy">© {new Date().getFullYear()} {SITE.name}</div>
      </div>
    </footer>
  );
}
