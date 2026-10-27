import { createClient } from '@supabase/supabase-js';

// The URL and publishable key are public by design; env vars override them per environment.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gkkkfzaypfsqhvytqosp.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_r46ZHx50VNHamHlS5mgQyQ_wluX5DFg';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gb-auth' },
});
