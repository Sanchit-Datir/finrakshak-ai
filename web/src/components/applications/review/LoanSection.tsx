import { SECTION_LABEL } from '../../../domain/labels.js';
import { TextField } from '../../ui/Field.js';
import { ReviewSection } from './ReviewSection.js';
import type { MoneyProps, SectionProps } from './types.js';

export function LoanSection({
  data,
  set,
  errors,
  unverified,
  onToggle,
  money,
  setMoney,
  required,
}: SectionProps & MoneyProps & { required: boolean }): React.JSX.Element {
  return (
    <ReviewSection title={SECTION_LABEL.loan} unverified={unverified} onToggle={onToggle}>
      <TextField
        label="Requested amount (₹)"
        required={required}
        inputMode="decimal"
        value={money.amount}
        error={errors.amount ?? null}
        onChange={(e) => {
          setMoney('amount', e.target.value);
        }}
      />
      <TextField
        label="Tenure (months)"
        type="number"
        min={1}
        max={360}
        value={data.loan.tenureMonths ?? ''}
        onChange={(e) => {
          set('loan', {
            tenureMonths:
              e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value))),
          });
        }}
      />
    </ReviewSection>
  );
}
