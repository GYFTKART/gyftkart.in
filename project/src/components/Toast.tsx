import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, X, Info, AlertTriangle } from 'lucide-react';

type ToastKind = 'success' | 'info' | 'error';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastCtx {
  push: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const iconFor = (kind: ToastKind) =>
  kind === 'success' ? CheckCircle2 : kind === 'error' ? AlertTriangle : Info;

const accentFor = (kind: ToastKind) =>
  kind === 'success'
    ? 'text-emerald-600 bg-emerald-50'
    : kind === 'error'
    ? 'text-rose-600 bg-rose-50'
    : 'text-brand-600 bg-brand-50';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  const remove = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed top-20 right-4 z-[200] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map((t) => {
          const Icon = iconFor(t.kind);
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-slate-100 bg-white pl-3 pr-2 py-3 shadow-card min-w-[260px] max-w-[360px] animate-slide-in-right"
            >
              <span className={`grid place-items-center h-9 w-9 rounded-xl ${accentFor(t.kind)}`}>
                <Icon className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-slate-700 flex-1 leading-snug">
                {t.message}
              </p>
              <button
                onClick={() => remove(t.id)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
