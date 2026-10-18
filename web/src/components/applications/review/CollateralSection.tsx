import { SECTION_LABEL } from '../../../domain/labels.js';
import { LandUnitSchema } from '../../../domain/schemas.js';
import { LAND_UNIT_LABEL } from '../../../lib/land.js';
import { SelectField, TextField } from '../../ui/Field.js';
import { ReviewSection } from './ReviewSection.js';
import type { MoneyProps, SectionProps } from './types.js';

export function CollateralSection({
  data,
  set,
  errors,
  unverified,
  onToggle,
  money,
  setMoney,
  agri,
}: SectionProps & MoneyProps & { agri: boolean }): React.JSX.Element {
  return (
    <ReviewSection title={SECTION_LABEL.collateral} unverified={unverified} onToggle={onToggle}>
      {agri && (
        <>
          <TextField
            label="Survey / Gat number (as written)"
            hint="Devanagari digits are kept as entered."
            lang="mr"
            value={data.collateral.surveyNumber}
            onChange={(e) => {
              set('collateral', { surveyNumber: e.target.value });
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="Land area"
              inputMode="decimal"
              value={data.collateral.landArea}
              onChange={(e) => {
                set('collateral', { landArea: e.target.value });
              }}
            />
            <SelectField
              label="Unit"
              value={data.collateral.landUnit}
              onChange={(e) => {
                set('collateral', { landUnit: LandUnitSchema.parse(e.target.value) });
              }}
            >
              {LandUnitSchema.options.map((u) => (
                <option key={u} value={u}>
                  {LAND_UNIT_LABEL[u]}
                </option>
              ))}
            </SelectField>
          </div>
        </>
      )}
      {data.loan.product === 'warehouse_receipt' && (
        <TextField
          label="Warehouse receipt number"
          value={data.collateral.warehouseReceiptNo}
          onChange={(e) => {
            set('collateral', { warehouseReceiptNo: e.target.value });
          }}
        />
      )}
      <TextField
        label="Estimated collateral value (₹)"
        inputMode="decimal"
        value={money.collateral}
        error={errors.collateral ?? null}
        onChange={(e) => {
          setMoney('collateral', e.target.value);
        }}
      />
    </ReviewSection>
  );
}
