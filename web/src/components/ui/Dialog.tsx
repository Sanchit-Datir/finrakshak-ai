import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button.js';
import { cn } from './cn.js';

/**
 * Modal dialog / side drawer built on native <dialog> (focus trapping and Esc
 * handling come from the browser).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'modal',
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'modal' | 'drawer';
  wide?: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        'bg-surface text-ink backdrop:bg-navy-deep/45 m-0 max-h-none max-w-none p-0',
        variant === 'drawer'
          ? 'ml-auto h-dvh w-full sm:w-[min(640px,92vw)]'
          : cn(
              'mx-auto my-auto max-h-[90dvh] w-[calc(100vw-32px)] rounded-2xl',
              wide ? 'sm:w-[720px]' : 'sm:w-[480px]',
            ),
      )}
    >
      {open && (
        <div className={cn('flex flex-col', variant === 'drawer' ? 'h-full' : 'max-h-[90dvh]')}>
          <div className="border-line flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[17px] font-semibold">
                {title}
              </h2>
              {description !== undefined && (
                <div className="text-muted mt-0.5 text-[13px]">{description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted hover:text-ink hover:bg-surface-2 rounded-lg p-1.5"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer !== undefined && (
            <div className="border-line flex flex-wrap justify-end gap-2 border-t px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}): React.JSX.Element {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm">{children}</div>
    </Dialog>
  );
}
