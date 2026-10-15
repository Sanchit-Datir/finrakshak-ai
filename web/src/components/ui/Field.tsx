import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn.js';

export const inputClass =
  'border-line bg-surface text-ink placeholder:text-muted/80 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 aria-[invalid=true]:border-danger';

function hasError(e: string | null | undefined): e is string {
  return e !== undefined && e !== null && e !== '';
}

interface Wrap {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  required?: boolean;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  className,
  required,
  children,
}: Wrap & { id: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium">
        {label}
        {required === true && (
          <span className="text-danger" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint !== undefined && !hasError(error) && (
        <p id={`${id}-hint`} className="text-muted mt-1 text-xs">
          {hint}
        </p>
      )}
      {hasError(error) && (
        <p id={`${id}-err`} className="text-danger mt-1 text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(
  id: string,
  hint: unknown,
  error: string | null | undefined,
): string | undefined {
  if (hasError(error)) return `${id}-err`;
  return hint === undefined ? undefined : `${id}-hint`;
}

export function TextField({
  label,
  hint,
  error,
  className,
  required,
  ...rest
}: Wrap & InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error ?? null}
      required={required ?? false}
      {...(className === undefined ? {} : { className })}
    >
      <input
        id={id}
        className={inputClass}
        aria-invalid={hasError(error)}
        aria-describedby={describedBy(id, hint, error)}
        required={required}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  required,
  children,
  ...rest
}: Wrap & SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error ?? null}
      required={required ?? false}
      {...(className === undefined ? {} : { className })}
    >
      <select
        id={id}
        className={inputClass}
        aria-invalid={hasError(error)}
        aria-describedby={describedBy(id, hint, error)}
        required={required}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  required,
  ...rest
}: Wrap & TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error ?? null}
      required={required ?? false}
      {...(className === undefined ? {} : { className })}
    >
      <textarea
        id={id}
        className={cn(inputClass, 'min-h-[84px]')}
        aria-invalid={hasError(error)}
        aria-describedby={describedBy(id, hint, error)}
        required={required}
        {...rest}
      />
    </FieldShell>
  );
}

export function Checkbox({
  label,
  hint,
  className,
  ...rest
}: { label: ReactNode; hint?: ReactNode; className?: string } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
>): React.JSX.Element {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <input
        id={id}
        type="checkbox"
        className="accent-primary mt-0.5 size-4 shrink-0"
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        {...rest}
      />
      <div>
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        {hint !== undefined && (
          <p id={`${id}-hint`} className="text-muted text-xs">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/** Compact select for filter bars. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="text-muted mb-1 block text-xs font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={cn(inputClass, 'h-9 py-1')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
