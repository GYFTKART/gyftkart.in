import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Admin sessions are ISOLATED from customer sessions on purpose.
 * Both contexts share the one Supabase singleton (persistSession:false
 * + autoRefreshToken:false), so whichever context last set the SDK
 * session wins the sliding window. A customer sign-in during an admin
 * test used to overwrite the SDK session, and admin/UA calls built from
 * `supabase.auth usage` sent a valid-but-NON-admin JWT → 403 'Admins
 * only'. Therefore the ADMIN context keeps its OWN localStorage cache
 * (separate key — a customer sign-in can never overwrite it) and admin
 * surfaces read token/refreshToken straight from this context instead
 * of the SDK session.
 */

interface AdminSessionCache {
  email: string;
  userId: string;
  token: string;
  refreshToken: string;
}

interface AdminUser {
  email: string;
  userId: string;
  /** Admin access token — the admin context's OWN cache, never a customer's. */
  token: string;
  /** Admin refresh token — for call-time refresh-first resolvers. */
  refreshToken: string;
}

interface AdminAuthContextValue {
  admin: AdminUser | null;
  // The very first render can't yet know whether a saved Supabase
  // session belongs to an admin — that check is async. ProtectedAdminRoute
  // needs this to avoid redirecting a valid admin to /admin on every
  // page refresh, mid-check.
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

const ADMIN_SESSION_KEY = 'gyftkart_admin_session';

function readCachedAdminSession(): AdminSessionCache | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSessionCache>;
    // Older caches (pre-token build) lack the tokens — treat as absent
    // so the old non-admin-only flow can't produce bearer-less calls.
    if (!parsed.email || !parsed.userId || !parsed.token || !parsed.refreshToken) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return parsed as AdminSessionCache;
  } catch {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
}

function cacheAdminSession(session: AdminSessionCache | null) {
  if (session) {
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  }
}

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
  // setSession() ROTATES the refresh token — exactly one admin restore
  // per mount, and the rotated pair is written straight into the admin
  // cache so the next mount stays in sync (same discipline the customer
  // context documents; the two restores are independent caches).
  const [restoreRan, setRestoreRan] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const cached = readCachedAdminSession();
      if (cached) {
        setAdmin({
          email: cached.email,
          userId: cached.userId,
          token: cached.token,
          refreshToken: cached.refreshToken,
        });
      }
      setLoading(false);

      if (cached && !restoreRan) {
        setRestoreRan(true);
        const { data, error } = await supabase.auth.setSession({
          access_token: cached.token,
          refresh_token: cached.refreshToken,
        });
        if (!error && data.session) {
          const refreshed: AdminSessionCache = {
            email: cached.email,
            userId: cached.userId,
            token: data.session.access_token,
            refreshToken: data.session.refresh_token,
          };
          cacheAdminSession(refreshed);
          setAdmin({
            email: cached.email,
            userId: cached.userId,
            token: data.session.access_token,
            refreshToken: data.session.refresh_token,
          });
        }
      }
      if (!active) return;
    })();

    // Keeps `admin` in sync with sign-in/sign-out events, but NEVER lets
    // a customer session clobber the admin state when the admin cache is
    // present — that collision was the root cause of 403 'Admins only'.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const cached = readCachedAdminSession();
      if (session?.user) {
        if (active) {
          if (session.user.id === cached?.userId) {
            // The admin's own session event (e.g. our restore): lift the
            // fresh tokens into admin state.
            setAdmin({
              email: cached.email,
              userId: cached.userId,
              token: session.access_token,
              refreshToken: session.refresh_token,
            });
          } else if (!cached) {
            checkIsAdmin(session.user.id).then((isAdmin) => {
              if (active) {
                setAdmin(
                  isAdmin
                    ? {
                        email: session.user.email ?? '',
                        userId: session.user.id,
                        token: session.access_token,
                        refreshToken: session.refresh_token ?? '',
                      }
                    : null
                );
              }
            });
          }
          // Customer session on an admin-cached tab: intentionally ignored.
        }
      } else if (active && !cached) {
        // Nobody cached an admin sign-in; a plain sign-out clears state.
        setAdmin(null);
      }
      // Sign-out events WITH an admin cache left untouched — the admin
      // state survives until the admin logs out explicitly.
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [restoreRan]);

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

    const session: AdminSessionCache = {
      email: data.user.email ?? '',
      userId: data.user.id,
      token: data.session?.access_token ?? '',
      refreshToken: data.session?.refresh_token ?? '',
    };
    cacheAdminSession(session);
    setAdmin({
      email: session.email,
      userId: session.userId,
      token: session.token,
      refreshToken: session.refreshToken,
    });
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    void supabase.auth.signOut();
    cacheAdminSession(null);
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
