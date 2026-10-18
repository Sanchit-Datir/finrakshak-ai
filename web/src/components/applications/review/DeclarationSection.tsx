import { SECTION_LABEL } from '../../../domain/labels.js';
import { Checkbox, TextArea } from '../../ui/Field.js';
import { ReviewSection } from './ReviewSection.js';
import type { SectionProps } from './types.js';

export function DeclarationSection({
  data,
  set,
  errors,
  unverified,
  onToggle,
  required,
}: SectionProps & { required: boolean }): React.JSX.Element {
  return (
    <ReviewSection title={SECTION_LABEL.declaration} unverified={unverified} onToggle={onToggle}>
      <TextArea
        label="Declared loan purpose"
        required={required}
        className="sm:col-span-2"
        value={data.loan.purpose}
        error={errors.purpose ?? null}
        onChange={(e) => {
          set('loan', { purpose: e.target.value });
        }}
      />
      <Checkbox
        className="sm:col-span-2"
        label="Applicant has signed the loan-purpose declaration"
        checked={data.declaration.purposeDeclared}
        onChange={(e) => {
          set('declaration', { purposeDeclared: e.target.checked });
        }}
      />
      <TextArea
        label="Officer remarks"
        className="sm:col-span-2"
        value={data.declaration.remarks}
        onChange={(e) => {
          set('declaration', { remarks: e.target.value });
        }}
      />
    </ReviewSection>
  );
}
