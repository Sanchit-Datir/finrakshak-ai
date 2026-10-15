import { Search, X } from 'lucide-react';
import { useId } from 'react';
import { cn } from './cn.js';
import { inputClass } from './Field.js';

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="text-muted mb-1 block text-xs font-medium">
        {label}
      </label>
      <div className="relative">
        <Search
          className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className={cn(inputClass, 'h-9 py-1 pr-8 pl-9')}
        />
        {value !== '' && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onChange('');
            }}
            className="text-muted hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
