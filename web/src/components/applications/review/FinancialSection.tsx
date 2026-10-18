import { SECTION_LABEL } from '../../../domain/labels.js';
import { TextField } from '../../ui/Field.js';
import { ReviewSection } from './ReviewSection.js';
import type { MoneyProps, SectionProps } from './types.js';

export function FinancialSection({
  data,
  set,
  errors,
  unverified,
  onToggle,
  money,
  setMoney,
}: SectionProps & MoneyProps): React.JSX.Element {
  return (
    <ReviewSection title={SECTION_LABEL.financial} unverified={unverified} onToggle={onToggle}>
      <TextField
        label="Occupation / business activity"
        value={data.financial.occupation}
        onChange={(e) => {
          set('financial', { occupation: e.target.value });
        }}
      />
      <TextField
        label="Declared annual income (₹)"
        inputMode="decimal"
        value={money.income}
        error={errors.income ?? null}
        onChange={(e) => {
          setMoney('income', e.target.value);
        }}
      />
      <TextField
        label="Existing liabilities (₹)"
        inputMode="decimal"
        value={money.liabilities}
        error={errors.liabilities ?? null}
        onChange={(e) => {
          setMoney('liabilities', e.target.value);
        }}
      />
    </ReviewSection>
  );
}
