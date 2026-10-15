import { CircleCheck, CircleX, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  push: (t: Omit<Toast, 'id'>) => void;
}

const Ctx = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      seq += 1;
      const id = seq;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      window.setTimeout(
        () => {
          dismiss(id);
        },
        t.tone === 'error' ? 9000 : 5000,
      );
    },
    [dismiss],
  );
  const api = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="no-print pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="card pointer-events-auto flex items-start gap-3 p-3"
            style={{ boxShadow: 'var(--shadow-pop)' }}
          >
            {t.tone === 'success' ? (
              <CircleCheck className="text-ok mt-0.5 size-5 shrink-0" aria-hidden />
            ) : t.tone === 'error' ? (
              <CircleX className="text-danger mt-0.5 size-5 shrink-0" aria-hidden />
            ) : (
              <Info className="text-info mt-0.5 size-5 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.detail !== undefined && (
                <p className="text-muted mt-0.5 text-[13px]">{t.detail}</p>
              )}
              {t.action !== undefined && (
                <button
                  type="button"
                  className="text-primary mt-1 text-[13px] font-semibold hover:underline"
                  onClick={t.action.onClick}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              className="text-muted hover:text-ink rounded p-0.5"
              onClick={() => {
                dismiss(t.id);
              }}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (ctx === null) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
