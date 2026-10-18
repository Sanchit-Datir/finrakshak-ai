import { SECTION_LABEL } from '../../../domain/labels.js';
import { TextField } from '../../ui/Field.js';
import { ReviewSection } from './ReviewSection.js';
import type { SectionProps } from './types.js';

export function ApplicantSection({
  data,
  set,
  errors,
  unverified,
  onToggle,
  required,
}: SectionProps & { required: boolean }): React.JSX.Element {
  return (
    <ReviewSection title={SECTION_LABEL.applicant} unverified={unverified} onToggle={onToggle}>
      <TextField
        label="Full name (English / transliterated)"
        required={required}
        value={data.applicant.fullName}
        error={errors.fullName ?? null}
        onChange={(e) => {
          set('applicant', { fullName: e.target.value });
        }}
      />
      <TextField
        label="Name in original script"
        lang="mr"
        className="font-deva"
        value={data.applicant.nameOriginal}
        onChange={(e) => {
          set('applicant', { nameOriginal: e.target.value });
        }}
      />
      <TextField
        label="Father / spouse name"
        value={data.applicant.fatherOrSpouse}
        onChange={(e) => {
          set('applicant', { fatherOrSpouse: e.target.value });
        }}
      />
      <TextField
        label="Date of birth"
        type="date"
        value={data.applicant.dob}
        onChange={(e) => {
          set('applicant', { dob: e.target.value });
        }}
      />
    </ReviewSection>
  );
}
