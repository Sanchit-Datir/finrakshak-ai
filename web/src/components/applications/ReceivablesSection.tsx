import { Plus, Trash2 } from 'lucide-react';
import { SECTION_LABEL } from '../../domain/labels.js';
import { MAX_TRADE_CUSTOMERS } from '../../domain/schemas.js';
import { emptyCustomerRow, MAX_CUSTOMER_NAME, type CustomerRow } from '../../lib/receivables.js';
import { cn } from '../ui/cn.js';
import { Button, IconButton } from '../ui/Button.js';
import { Checkbox, TextField } from '../ui/Field.js';

/**
 * Largest customers (trade debtors) of a business applicant, from its receivables ageing
 * statement. The public-records check matches them against insolvency and enforcement records.
 */
export function ReceivablesSection({
  rows,
  errors,
  unverified,
  onToggle,
  onChange,
}: {
  rows: readonly CustomerRow[];
  errors: Readonly<Record<number, string>>;
  unverified: boolean;
  onToggle: () => void;
  onChange: (rows: CustomerRow[]) => void;
}): React.JSX.Element {
  const update = (i: number, patch: Partial<CustomerRow>): void => {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number): void => {
    onChange(rows.filter((_, j) => j !== i));
  };
  const full = rows.length >= MAX_TRADE_CUSTOMERS;
  return (
    <fieldset className={cn('card p-4 sm:p-5', unverified && 'border-warn')}>
      {/* The legend must be the fieldset's first child to name the group. */}
      <legend className="float-left mb-1 text-[16px] font-semibold">
        {SECTION_LABEL.receivables}
      </legend>
      <div className="mb-1 flex flex-wrap justify-end">
        <Checkbox label="Mark information unverified" checked={unverified} onChange={onToggle} />
      </div>
      <p className="text-muted mb-3 clear-both text-[13px]">
        From the receivables ageing statement: the customers who owe the business the most. Add the
        CIN when known — public-record matching uses CIN first, then the exact registered name.
      </p>
      <ol className="space-y-3" aria-label="Customers">
        {rows.map((r, i) => (
          <li key={i} className="border-line rounded-lg border p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <TextField
                label={`Customer ${i + 1} name`}
                value={r.name}
                maxLength={MAX_CUSTOMER_NAME}
                onChange={(e) => {
                  update(i, { name: e.target.value });
                }}
              />
              <TextField
                label="CIN (optional)"
                value={r.cin}
                onChange={(e) => {
                  update(i, { cin: e.target.value.toUpperCase() });
                }}
              />
              <TextField
                label="Outstanding (₹)"
                inputMode="decimal"
                className="tabular"
                value={r.outstanding}
                onChange={(e) => {
                  update(i, { outstanding: e.target.value });
                }}
              />
              <TextField
                label="Oldest unpaid invoice"
                type="date"
                value={r.oldestUnpaidDate}
                onChange={(e) => {
                  update(i, { oldestUnpaidDate: e.target.value });
                }}
              />
              <IconButton
                label={`Remove customer ${i + 1}`}
                icon={Trash2}
                onClick={() => {
                  remove(i);
                }}
              />
            </div>
            {errors[i] !== undefined && (
              <p className="text-danger mt-2 text-xs" role="alert">
                {errors[i]}
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          icon={Plus}
          disabled={full}
          onClick={() => {
            onChange([...rows, emptyCustomerRow()]);
          }}
        >
          Add customer
        </Button>
        <span className="text-muted text-xs">
          {rows.length === 0
            ? 'No customers listed.'
            : `${rows.length} of ${MAX_TRADE_CUSTOMERS} rows used.`}
        </span>
      </div>
    </fieldset>
  );
}
