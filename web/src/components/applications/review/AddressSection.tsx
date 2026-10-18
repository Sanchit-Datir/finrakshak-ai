import { SECTION_LABEL } from '../../../domain/labels.js';
import { TextField } from '../../ui/Field.js';
import { ReviewSection } from './ReviewSection.js';
import type { SectionProps } from './types.js';

export function AddressSection({
  data,
  set,
  unverified,
  onToggle,
}: SectionProps): React.JSX.Element {
  return (
    <ReviewSection title={SECTION_LABEL.address} unverified={unverified} onToggle={onToggle}>
      <TextField
        label="Address line"
        className="sm:col-span-2"
        value={data.address.line}
        onChange={(e) => {
          set('address', { line: e.target.value });
        }}
      />
      <TextField
        label="Village (गाव)"
        value={data.address.village}
        onChange={(e) => {
          set('address', { village: e.target.value });
        }}
      />
      <TextField
        label="Taluka (तालुका)"
        value={data.address.taluka}
        onChange={(e) => {
          set('address', { taluka: e.target.value });
        }}
      />
      <TextField
        label="District (जिल्हा)"
        value={data.address.district}
        onChange={(e) => {
          set('address', { district: e.target.value });
        }}
      />
      <TextField
        label="PIN code"
        inputMode="numeric"
        maxLength={6}
        value={data.address.pincode}
        onChange={(e) => {
          set('address', { pincode: e.target.value.replace(/\D/g, '') });
        }}
      />
      <TextField
        label="Mobile"
        inputMode="tel"
        value={data.applicant.mobile}
        onChange={(e) => {
          set('applicant', { mobile: e.target.value });
        }}
      />
    </ReviewSection>
  );
}
