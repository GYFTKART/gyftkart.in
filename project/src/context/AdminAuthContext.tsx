import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';

interface AdminUser {
  email: string;
}

interface AdminAuthContextValue {
  admin: AdminUser | null;
  // New: the very first render can't yet know whether a saved Supabase
  // session belongs to an admin — that check is async. ProtectedAdminRoute
  // needs this to avoid redirecting a valid admin to /admin on every
  // page refresh, mid-check.
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

// Being *any* logged-in Supabase user isn't enough to be an admin —
// this checks the same `admins` table the brands RLS policies check,
// so "am I allowed into the dashboard" and "am I allowed to write
// brands" always agree.
async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('admins').select('id').eq('id', userId).maybeSingle();
  if (error) {
    console.error('Admin membership check failed:', error);
    return false;
  }
  return Boolean(data);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Cover a hard refresh on /admin/dashboard: Supabase may already
    // have a session persisted (localStorage) before this component
    // ever mounts — restore it instead of bouncing straight to /admin.
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session?.user) {
        const isAdmin = await checkIsAdmin(session.user.id);
        if (active) setAdmin(isAdmin ? { email: session.user.email ?? '' } : null);
      }
      if (active) setLoading(false);
    })();

    // Keeps `admin` in sync with sign-in/sign-out events that happen
    // after mount (including from the login() call below).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        checkIsAdmin(session.user.id).then((isAdmin) => {
          if (active) setAdmin(isAdmin ? { email: session.user.email ?? '' } : null);
        });
      } else if (active) {
        setAdmin(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.user) {
      return { ok: false, error: 'Incorrect Login Details' };
    }

    const isAdmin = await checkIsAdmin(data.user.id);
    if (!isAdmin) {
      // Credentials were valid for *some* Supabase account, but that
      // account isn't in `admins` — sign back out rather than leaving
      // an authenticated-but-not-admin session sitting around.
      await supabase.auth.signOut();
      return { ok: false, error: 'Incorrect Login Details' };
    }

    setAdmin({ email: data.user.email ?? '' });
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    void supabase.auth.signOut();
    setAdmin(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
