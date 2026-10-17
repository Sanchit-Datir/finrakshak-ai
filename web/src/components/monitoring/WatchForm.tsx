import { Plus } from 'lucide-react';
import { useState } from 'react';
import { parseRupeesToMinor } from '../../lib/format.js';
import type { NewWatch } from '../../state/actions.js';
import { Button } from '../ui/Button.js';
import { Card, CardHeader } from '../ui/Card.js';
import { TextField } from '../ui/Field.js';

interface Values {
  loanRef: string;
  borrowerName: string;
  cin: string;
  amount: string;
  disbursedOn: string;
}
type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = { loanRef: '', borrowerName: '', cin: '', amount: '', disbursedOn: '' };
const CIN = /^([LUF]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}|[A-Z]{3}-\d{4})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validate(v: Values): Errors {
  const e: Errors = {};
  if (v.loanRef.trim() === '') e.loanRef = 'Enter the loan account or reference.';
  else if (v.loanRef.trim().length > 60) e.loanRef = 'Use at most 60 characters.';
  if (v.borrowerName.trim() === '') e.borrowerName = 'Enter the borrower’s registered name.';
  else if (v.borrowerName.trim().length > 200) e.borrowerName = 'Use at most 200 characters.';
  if (v.cin !== '' && !CIN.test(v.cin))
    e.cin = 'Enter a 21-character CIN or LLPIN, or leave blank.';
  if (v.amount.trim() !== '' && parseRupeesToMinor(v.amount) === null)
    e.amount = 'Enter rupees using digits, e.g. 20000000.';
  if (!DAY.test(v.disbursedOn)) e.disbursedOn = 'Enter the disbursement date.';
  return e;
}

/** Adds a disbursed loan's borrower to the public-records watch. */
export function WatchForm({
  branchId,
  onAdd,
}: {
  branchId: string;
  onAdd: (input: NewWatch) => void;
}): React.JSX.Element {
  const [v, setV] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const field = (
    k: keyof Values,
  ): {
    value: string;
    error: string | null;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  } => ({
    value: v[k],
    error: errors[k] ?? null,
    onChange: (e: React.ChangeEvent<HTMLInputElement>): void => {
      const raw = k === 'cin' ? e.target.value.toUpperCase().trim() : e.target.value;
      setV((x) => ({ ...x, [k]: raw }));
    },
  });
  const submit = (e: React.SyntheticEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const errs = validate(v);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onAdd({
      loanRef: v.loanRef.trim(),
      borrowerName: v.borrowerName.trim(),
      cin: v.cin,
      amountMinor: v.amount.trim() === '' ? null : parseRupeesToMinor(v.amount),
      disbursedOn: v.disbursedOn,
      branchId,
    });
    setV(EMPTY);
  };
  return (
    <Card>
      <CardHeader
        title="Watch a disbursed loan"
        subtitle="The borrower is matched to public records by CIN first, then by exact registered name. Records dated after disbursement raise alerts."
      />
      <form
        className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={submit}
        noValidate
      >
        <TextField label="Loan reference" {...field('loanRef')} />
        <TextField
          label="Borrower (registered name)"
          className="lg:col-span-2"
          {...field('borrowerName')}
        />
        <TextField label="CIN (optional)" {...field('cin')} />
        <TextField label="Disbursed on" type="date" {...field('disbursedOn')} />
        <TextField label="Amount disbursed (₹)" inputMode="decimal" {...field('amount')} />
        <div className="flex items-end sm:col-span-2 lg:col-span-4">
          <Button type="submit" variant="primary" icon={Plus}>
            Add to watch
          </Button>
        </div>
      </form>
    </Card>
  );
}
