import { useState } from 'react';
import { Card } from '../ui/Card.js';
import { Checkbox, SelectField } from '../ui/Field.js';
import { Notice } from '../ui/States.js';
import { PRODUCT_LABEL } from '../../domain/labels.js';
import { LoanProductSchema } from '../../domain/schemas.js';
import type { LoanProduct } from '../../domain/schemas.js';
import { DOC_GROUPS, docTypeLabel } from '../../lib/doc-catalog.js';
import { canConfigureRules, useSession } from '../../state/session.js';
import { mutate, useDb } from '../../state/store.js';
import { useToast } from '../../state/toast.js';

export function ChecklistTab(): React.JSX.Element {
  const db = useDb();
  const toast = useToast();
  const session = useSession();
  const allowed = canConfigureRules(session?.role);
  const [product, setProduct] = useState<LoanProduct>('kcc_crop');
  const list = db.settings.checklists[product];
  const toggle = (key: string, on: boolean): void => {
    mutate((d) => {
      d.settings.checklists[product] = on
        ? [...d.settings.checklists[product], key]
        : d.settings.checklists[product].filter((k) => k !== key);
    });
    toast.push({
      tone: 'success',
      title: 'Checklist updated',
      detail: `${PRODUCT_LABEL[product]}: ${docTypeLabel(key)} ${on ? 'required' : 'no longer required'}`,
    });
  };
  return (
    <Card className="p-5">
      {!allowed && (
        <Notice tone="warn" className="mb-4" title="Read only">
          Only Risk Analyst and Administrator roles can change checklists.
        </Notice>
      )}
      <SelectField
        label="Loan product"
        value={product}
        className="max-w-sm"
        onChange={(e) => {
          setProduct(LoanProductSchema.parse(e.target.value));
        }}
      >
        {LoanProductSchema.options.map((p) => (
          <option key={p} value={p}>
            {PRODUCT_LABEL[p]}
          </option>
        ))}
      </SelectField>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOC_GROUPS.map((g) => (
          <fieldset key={g.group}>
            <legend className="mb-2 text-sm font-semibold">{g.group}</legend>
            <div className="space-y-1.5">
              {g.types.map((t) => (
                <Checkbox
                  key={t.key}
                  label={docTypeLabel(t.key)}
                  checked={list.includes(t.key)}
                  disabled={!allowed}
                  onChange={(e) => {
                    toggle(t.key, e.target.checked);
                  }}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <p className="text-muted mt-4 text-xs">
        Board resolution and company registration apply only to companies; partnership deed only to
        partnerships.
      </p>
    </Card>
  );
}
