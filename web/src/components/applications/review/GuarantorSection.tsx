import { SECTION_LABEL } from '../../../domain/labels.js';
import { TextField } from '../../ui/Field.js';
import { ReviewSection } from './ReviewSection.js';
import type { SectionProps } from './types.js';

export function GuarantorSection({
  data,
  set,
  unverified,
  onToggle,
}: SectionProps): React.JSX.Element {
  return (
    <ReviewSection title={SECTION_LABEL.guarantor} unverified={unverified} onToggle={onToggle}>
      <TextField
        label="Guarantor / co-borrower name"
        value={data.guarantor.name}
        onChange={(e) => {
          set('guarantor', { name: e.target.value });
        }}
      />
      <TextField
        label="Relationship to applicant"
        value={data.guarantor.relation}
        onChange={(e) => {
          set('guarantor', { relation: e.target.value });
        }}
      />
    </ReviewSection>
  );
}
