import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// persistSession/autoRefreshToken explicitly OFF: this app manages its
// own lightweight session cache in CustomerAuthContext.tsx (see
// SESSION_KEY = 'gyftkart_session'), which mirrors just the profile
// fields the UI needs (name/email/phone) and is the single source of
// truth for "is someone logged in" client-side. Leaving Supabase's own
// defaults (persistSession: true, autoRefreshToken: true) on made the
// SDK silently keep a second, separate session/token copy in
// localStorage and refresh it on its own timer in the background — a
// second, un-synced source of truth for the same thing, with no code
// anywhere subscribed to it via onAuthStateChange. Turning both off
// makes CustomerAuthContext.tsx's session cache the only one that
// exists, matching what its own comments already claimed was true.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
