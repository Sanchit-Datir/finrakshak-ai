import { SECTION_LABEL } from '../../../domain/labels.js';
import type { BorrowerType } from '../../../domain/schemas.js';
import { TextField } from '../../ui/Field.js';
import { ReviewSection } from './ReviewSection.js';
import type { SectionProps } from './types.js';

export function BusinessSection({
  data,
  set,
  errors,
  unverified,
  onToggle,
  borrowerType,
}: SectionProps & { borrowerType: BorrowerType }): React.JSX.Element {
  return (
    <ReviewSection title={SECTION_LABEL.business} unverified={unverified} onToggle={onToggle}>
      <TextField
        label="Business / firm name"
        value={data.business.businessName}
        onChange={(e) => {
          set('business', { businessName: e.target.value });
        }}
      />
      {(borrowerType === 'private_limited' || borrowerType === 'partnership') && (
        <TextField
          label={
            borrowerType === 'private_limited'
              ? 'CIN / registration number'
              : 'Partnership registration number'
          }
          value={data.business.registrationNo}
          onChange={(e) => {
            set('business', { registrationNo: e.target.value });
          }}
        />
      )}
      <TextField
        label="PAN of the business"
        value={data.business.pan}
        maxLength={10}
        autoComplete="off"
        error={errors.pan ?? null}
        onChange={(e) => {
          set('business', { pan: e.target.value.toUpperCase().trim() });
        }}
      />
      <TextField
        label="GSTIN"
        value={data.business.gstin}
        onChange={(e) => {
          set('business', { gstin: e.target.value.toUpperCase() });
        }}
      />
      <TextField
        label="Udyam registration number"
        value={data.business.udyamNo}
        onChange={(e) => {
          set('business', { udyamNo: e.target.value.toUpperCase() });
        }}
      />
    </ReviewSection>
  );
}
