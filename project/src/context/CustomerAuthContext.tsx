import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';

export interface Session {
  id: string;
  name: string;
  email: string;
  phone: string;
  token: string;
  refreshToken: string;
}

interface LoginResult {
  ok: boolean;
  error?: string;
  name?: string;
}

interface SignupResult {
  ok: boolean;
  error?: string;
  /** true if Supabase requires the person to confirm their email before logging in */
  needsEmailConfirmation?: boolean;
}

interface CustomerAuthContextValue {
  session: Session | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  signup: (name: string, email: string, phone: string, password: string) => Promise<SignupResult>;
  logout: () => void;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  /**
   * False until the cached session (if any) has been re-attached to the
   * Supabase client via setSession — or, if there was no cached session,
   * until that check has run and confirmed there's nothing to restore.
   * Anything that queries Supabase using the logged-in user's identity
   * (e.g. CartContext's fetchRemoteCart) must wait for this to be true
   * before running, otherwise it queries with no JWT attached and gets
   * an empty/anonymous result even though `session` already looks
   * populated (the local profile cache resolves synchronously; actually
   * re-attaching the token to the Supabase client is async).
   */
  authReady: boolean;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

// The Supabase client is created with `persistSession: false`, so it will
// NOT automatically restore a session after a page refresh. This small
// local cache mirrors the profile fields we display in the UI
// (name/email/phone) *and* both Supabase tokens, so "Hi, <name>" keeps
// working across refreshes AND — via the setSession() call in the effect
// below — the Supabase client itself gets its JWT re-attached, so
// RLS-scoped queries (cart, orders, etc.) actually authenticate instead
// of silently running anonymous. The actual credential check
// (signup/login) always goes through Supabase Auth on the server.
const SESSION_KEY = 'gyftkart_session';

function getCachedSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function cacheSession(session: Session | null) {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------
// Session restore: deduped + lock-guarded.
//
// supabase.auth.setSession() ROTATES the refresh token — the one we
// send in is consumed and a new one comes back. That new pair only
// reaches localStorage once the response arrives (cacheSession below).
// Two things used to be able to go wrong when the page refreshes
// rapidly or multiple tabs are open:
//
//  1. A page unloads (next refresh fires) before its in-flight
//     setSession() response lands and gets cached. The next load then
//     reads the OLD refresh token — already consumed/rotated away by
//     the previous load — and Supabase correctly rejects it, which we
//     used to treat as "not logged in" and wipe the cache.
//  2. Two near-simultaneous callers (two tabs refreshed together, or a
//     dev-mode double-mount) both read the same cached token and both
//     call setSession(). Only one can win; the loser's rejection used
//     to wipe the cache even when the winner had just written a
//     perfectly good, fresher pair.
//
// `inFlightRestore` dedupes concurrent calls within this tab so only
// one setSession() call is ever made per cached token generation.
// `navigator.locks` (Web Locks API — supported in all current major
// browsers) extends that guarantee across TABS: if another tab is
// mid-rotation, this one waits for the lock instead of racing it, then
// re-reads localStorage to pick up whatever the lock-holder just wrote.
// ---------------------------------------------------------------------

let inFlightRestore: Promise<Session | null> | null = null;

async function performRestore(): Promise<Session | null> {
  // Re-read here (not just at the top of restoreSessionOnce) because by
  // the time we actually get the lock, another tab may have already
  // rotated the tokens — we want the freshest cache, not the one that
  // was current when we started waiting.
  const cached = getCachedSession();

  if (!cached) return null;

  if (!cached.token || !cached.refreshToken) {
    // Cached profile exists but is missing a usable token pair — most
    // likely saved by an older build of this file, before refreshToken
    // was tracked. There is no way to re-attach a JWT to the Supabase
    // client from this, so it cannot be trusted. Leaving it in place
    // would make `session` look logged-in while the Supabase client
    // stays anonymous underneath — the exact mismatch that silently
    // empties the cart.
    cacheSession(null);
    return null;
  }

  let result: Awaited<ReturnType<typeof supabase.auth.setSession>>;
  try {
    result = await supabase.auth.setSession({
      access_token: cached.token,
      refresh_token: cached.refreshToken,
    });
  } catch (err) {
    // Network/transport failure — NOT a rejection of the token itself.
    // The cached refresh token may still be perfectly valid; it just
    // couldn't be exchanged on this attempt. Keep the cache as-is
    // (optimistically stay "logged in" in the UI) so the next load can
    // retry, instead of treating a dropped connection as a logout.
    console.error('Session restore failed (network):', err);
    return cached;
  }

  const { data, error } = result;

  if (error || !data.session) {
    // A genuine rejection from Supabase (token really is invalid or
    // was already consumed elsewhere) — only now is it safe to drop
    // the cache.
    cacheSession(null);
    return null;
  }

  // Tokens rotate on every refresh — keep the cache in sync so the
  // next hard refresh (or the next tab to grab the lock) uses the
  // current pair, not the one from however many refreshes ago.
  const refreshed: Session = {
    ...cached,
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
  cacheSession(refreshed);
  return refreshed;
}

function restoreSessionOnce(): Promise<Session | null> {
  if (inFlightRestore) return inFlightRestore;

  inFlightRestore = (async () => {
    try {
      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      if (locks) {
        return await locks.request('gyftkart-auth-refresh', performRestore);
      }
      // Browsers without the Locks API still get the same-tab dedupe
      // above — just not the cross-tab coordination.
      return await performRestore();
    } finally {
      // Cleared in finally (not after await resolves) so a call that
      // arrives while we're still inside the lock genuinely awaits the
      // same promise rather than starting a second one.
      inFlightRestore = null;
    }
  })();

  return inFlightRestore;
}

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getCachedSession());
  const [authReady, setAuthReady] = useState(false);

  // On mount, re-attach the cached JWT to the Supabase client so it's
  // actually authenticated for this page load — the local `session`
  // state above only restores the UI-facing profile fields synchronously
  // from localStorage; it does nothing to the Supabase client itself.
  useEffect(() => {
    let cancelled = false;

    restoreSessionOnce().then((restored) => {
      if (cancelled) return;
      setSession(restored);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const signup = useCallback(
    async (name: string, email: string, phone: string, password: string): Promise<SignupResult> => {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPhone = phone.trim();

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { name: trimmedName, phone: trimmedPhone },
        },
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      // If Supabase's "Confirm email" setting is ON, `data.session` comes
      // back null here — the account exists but can't log in yet until
      // the person clicks the confirmation link in their inbox.
      const needsEmailConfirmation = !data.session;

      return { ok: true, needsEmailConfirmation };
    },
    []
  );

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const trimmedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error || !data.user) {
      return { ok: false, error: error?.message ?? 'Incorrect email or password.' };
    }

    const meta = data.user.user_metadata as { name?: string; phone?: string } | null;
    const newSession: Session = {
      id: data.user.id,
      name: meta?.name ?? '',
      email: data.user.email ?? trimmedEmail,
      phone: meta?.phone ?? '',
      token: data.session?.access_token ?? '',
      refreshToken: data.session?.refresh_token ?? '',
    };

    cacheSession(newSession);
    setSession(newSession);

    return { ok: true, name: newSession.name };
  }, []);

  const logout = useCallback(() => {
    // Fire and forget — we don't need to block the UI on the network
    // round trip for signOut to clear the locally cached session.
    void supabase.auth.signOut();
    cacheSession(null);
    setSession(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }, []);

  return (
    <CustomerAuthContext.Provider
      value={{ session, login, signup, logout, requestPasswordReset, authReady }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useAuth must be used within CustomerAuthProvider');
  return ctx;
}
