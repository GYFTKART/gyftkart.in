import {
  createContext,
  useCallback,
  useContext,
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
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

// The Supabase client is created with `persistSession: false`, so it will
// NOT automatically restore a session after a page refresh. This small
// local cache mirrors just the profile fields we display in the UI
// (name/email/phone) so "Hi, <name>" and "Buy for self" keep working
// across refreshes without re-authenticating every keystroke. The actual
// credential check (signup/login) always goes through Supabase Auth on
// the server, which is what makes accounts work from any browser/device.
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
    <CustomerAuthContext.Provider value={{ session, login, signup, logout, requestPasswordReset }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useAuth must be used within CustomerAuthProvider');
  return ctx;
}
