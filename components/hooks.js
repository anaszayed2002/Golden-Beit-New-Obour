'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// undefined while loading, null when signed out, the user object when signed in.
export function useSession() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  // Accounts are shared across Golden Beit platforms; this marks the account as a New Obour customer.
  const userId = user?.id;
  useEffect(() => {
    if (userId) supabase.rpc('nob_touch').then(() => {}, () => {});
  }, [userId]);
  return user;
}

export function useToast() {
  const [text, setText] = useState('');
  const timer = useRef();
  const show = useCallback((t) => {
    setText(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(''), 3500);
  }, []);
  return [text, show];
}

export function useBodyLock(locked) {
  useEffect(() => {
    document.body.classList.toggle('lock', !!locked);
    return () => document.body.classList.remove('lock');
  }, [locked]);
}

export function useEscape(handler) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && handler();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handler]);
}
