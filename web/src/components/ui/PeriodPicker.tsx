import { CalendarDays } from 'lucide-react';
import { PERIOD_LABEL, type PeriodKind, type PeriodValue } from '../../lib/period.js';
import { inputClass } from './Field.js';
import { cn } from './cn.js';

export function PeriodPicker({
  value,
  onChange,
  options = ['today', '7d', 'month', 'custom'],
  label = 'Period',
}: {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
  options?: PeriodKind[];
  label?: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label
          htmlFor="period-kind"
          className="text-muted mb-1 flex items-center gap-1 text-xs font-medium"
        >
          <CalendarDays className="size-3.5" aria-hidden /> {label}
        </label>
        <select
          id="period-kind"
          value={value.kind}
          onChange={(e) => {
            onChange({ ...value, kind: e.target.value as PeriodKind });
          }}
          className={cn(inputClass, 'h-9 w-auto py-1')}
        >
          {options.map((k) => (
            <option key={k} value={k}>
              {PERIOD_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      {value.kind === 'custom' && (
        <>
          <div>
            <label htmlFor="period-from" className="text-muted mb-1 block text-xs font-medium">
              From
            </label>
            <input
              id="period-from"
              type="date"
              value={value.from}
              max={value.to}
              onChange={(e) => {
                onChange({ ...value, from: e.target.value });
              }}
              className={cn(inputClass, 'h-9 w-auto py-1')}
            />
          </div>
          <div>
            <label htmlFor="period-to" className="text-muted mb-1 block text-xs font-medium">
              To
            </label>
            <input
              id="period-to"
              type="date"
              value={value.to}
              min={value.from}
              onChange={(e) => {
                onChange({ ...value, to: e.target.value });
              }}
              className={cn(inputClass, 'h-9 w-auto py-1')}
            />
          </div>
        </>
      )}
    </div>
  );
}
