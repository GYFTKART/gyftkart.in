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

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getCachedSession());
  const [authReady, setAuthReady] = useState(false);

  // On mount, re-attach the cached JWT to the Supabase client so it's
  // actually authenticated for this page load — the local `session`
  // state above only restores the UI-facing profile fields synchronously
  // from localStorage; it does nothing to the Supabase client itself.
  // Runs once per mount (hard refresh / first load), which is exactly
  // when the client otherwise has no token at all given
  // persistSession: false.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const cached = getCachedSession();
      if (cached?.token && cached?.refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: cached.token,
          refresh_token: cached.refreshToken,
        });
        if (cancelled) return;

        if (error || !data.session) {
          // Refresh token expired/invalid — cached profile is stale,
          // drop it so the UI doesn't claim to be logged in against a
          // client that actually isn't.
          cacheSession(null);
          setSession(null);
        } else {
          // Tokens rotate on refresh — keep the cache in sync so the
          // next hard refresh uses the current pair, not the one from
          // however many refreshes ago.
          const refreshed: Session = {
            ...cached,
            token: data.session.access_token,
            refreshToken: data.session.refresh_token,
          };
          cacheSession(refreshed);
          setSession(refreshed);
        }
      } else if (cached) {
        // A cached session exists but is missing a usable token pair —
        // most likely saved by an older build of this file, before
        // refreshToken was tracked. There is no way to re-attach a JWT
        // to the Supabase client from this, so it cannot be trusted.
        // Leaving it in place would make `session` look logged-in while
        // the Supabase client stays anonymous underneath — the exact
        // mismatch that silently empties the cart. Drop it instead; the
        // person will need to log in again once, and every login from
        // here on caches the full pair.
        cacheSession(null);
        setSession(null);
      }
      if (!cancelled) setAuthReady(true);
    }

    restore();
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
