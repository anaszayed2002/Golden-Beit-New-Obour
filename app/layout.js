import { IBM_Plex_Sans_Arabic, Reem_Kufi } from 'next/font/google';
import './globals.css';

const body = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });
const display = Reem_Kufi({ subsets: ['arabic', 'latin'], weight: ['500', '700'], variable: '--font-display', display: 'swap' });

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://golden-beit-new-obour.vercel.app'),
  title: 'Golden Beit New Obour',
  description: 'أراضي القادسية والأمل في العبور الجديدة: قطع معروضة للبيع بالسعر والمساحة والمدفوع والمتبقي.',
  openGraph: { title: 'Golden Beit New Obour', description: 'أراضي القادسية والأمل في العبور الجديدة', images: ['/logo.png'], locale: 'ar_EG' },
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0A3022' };

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
