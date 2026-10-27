'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PHONE_RE, normalizePhone, phoneToEmail } from '@/lib/site';

function authError(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'رقم التليفون أو كلمة السر غلط.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'الرقم ده عليه حساب بالفعل. ادخل من تبويب "دخول".';
  if (m.includes('password')) return 'كلمة السر لازم تكون 6 حروف أو أرقام على الأقل.';
  if (m.includes('rate limit')) return 'محاولات كتير ورا بعض. استنى دقيقة وجرب تاني.';
  if (m.includes('database error')) return 'مقدرناش نعمل الحساب. اتأكد من الاسم ورقم التليفون.';
  return 'حصلت مشكلة. جرب تاني بعد شوية.';
}

// mode: 'in' | 'reg'. allowRegister=false hides the "new account" tab (admin page).
export default function AuthModal({ initialMode = 'reg', why, onClose, onDone, allowRegister = true, inline = false }) {
  const [mode, setMode] = useState(allowRegister ? initialMode : 'in');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reg = mode === 'reg';

  async function submit(e) {
    e.preventDefault();
    setError('');
    const p = normalizePhone(phone);
    if (reg && name.trim().length < 2) return setError('اكتب اسمك.');
    if (!PHONE_RE.test(p)) return setError('اكتب رقم موبايل مصري صح، زي 01012345678.');
    if (pass.length < 6) return setError('كلمة السر لازم تكون 6 حروف أو أرقام على الأقل.');
    setBusy(true);
    const email = phoneToEmail(p);
    const res = reg
      ? await supabase.auth.signUp({ email, password: pass, options: { data: { full_name: name.trim() } } })
      : await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (res.error) return setError(authError(res.error));
    // signUp on an existing number returns a user with no identities instead of an error.
    if (reg && res.data.user && res.data.user.identities?.length === 0) return setError(authError({ message: 'already registered' }));
    if (reg && !res.data.session) {
      const signIn = await supabase.auth.signInWithPassword({ email, password: pass });
      if (signIn.error) return setError(authError(signIn.error));
      return onDone?.(signIn.data.user);
    }
    onDone?.(res.data.user);
  }

  const form = (
    <form className="sheet narrow" onSubmit={submit} noValidate>
      <h3>{reg ? 'حساب جديد' : 'تسجيل الدخول'}</h3>
      <p className="sub">{reg ? 'بالاسم ورقم التليفون وكلمة سر بس.' : 'برقم التليفون وكلمة السر.'}</p>
      {why && <div className="auth-why">{why}</div>}
      {allowRegister && (
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!reg} onClick={() => { setMode('in'); setError(''); }}>دخول</button>
          <button type="button" role="tab" aria-selected={reg} onClick={() => { setMode('reg'); setError(''); }}>حساب جديد</button>
        </div>
      )}
      <div className="grid one">
        {reg && (
          <div className="field">
            <label htmlFor="a-name">الاسم</label>
            <input id="a-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
        )}
        <div className="field">
          <label htmlFor="a-phone">رقم التليفون</label>
          <input id="a-phone" className="num" type="tel" inputMode="tel" autoComplete="tel" placeholder="01xxxxxxxxx"
            value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="a-pass">كلمة السر</label>
          <input id="a-pass" type="password" autoComplete={reg ? 'new-password' : 'current-password'}
            value={pass} onChange={(e) => setPass(e.target.value)} />
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'استنى...' : reg ? 'إنشاء الحساب' : 'دخول'}</button>
        {onClose && <button type="button" className="btn" onClick={onClose}>إلغاء</button>}
      </div>
    </form>
  );

  if (inline) return <div className="inline-auth">{form}</div>;
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      {form}
    </div>
  );
}
