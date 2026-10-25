import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',          // email links come back as ?code=..., which leaves the #/ router alone
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Where Supabase email links (confirm, reset password) should land.
export const redirectUrl = () => location.origin + location.pathname;
