import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

interface AdminUser {
  email: string;
}

interface AdminAuthContextValue {
  admin: AdminUser | null;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);
const STORAGE_KEY = 'gyftkart_admin';

// Official admin credentials.
const ADMIN_EMAIL = 'gyftkart@gmail.com';
const ADMIN_PASSWORD = 'sA@9450257575';

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(
    async (email: string, password: string) => {
      await new Promise((r) => setTimeout(r, 650));
      if (email.trim() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        const user = { email: ADMIN_EMAIL };
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        } catch {
          /* ignore */
        }
        setAdmin(user);
        return { ok: true };
      }
      return { ok: false, error: 'Incorrect Login Details' };
    },
    []
  );

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setAdmin(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
