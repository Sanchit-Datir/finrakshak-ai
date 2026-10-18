import { Card } from '../../ui/Card.js';
import { PRODUCT_LABEL, SECTION_LABEL } from '../../../domain/labels.js';
import type { Application } from '../../../domain/schemas.js';
import { formatMoney } from '../../../lib/format.js';

export function ApplicantTab({ app }: { app: Application }): React.JSX.Element {
  const d = app.data;
  const groups: [string, [string, string][]][] = [
    [
      SECTION_LABEL.applicant,
      [
        ['Full name', d.applicant.fullName],
        ['Original script', d.applicant.nameOriginal],
        ['Father / spouse', d.applicant.fatherOrSpouse],
        ['Date of birth', d.applicant.dob],
        ['Mobile', d.applicant.mobile],
      ],
    ],
    [
      SECTION_LABEL.loan,
      [
        ['Product', PRODUCT_LABEL[d.loan.product]],
        ['Amount', formatMoney(d.loan.amountMinor)],
        ['Tenure', d.loan.tenureMonths === null ? '' : `${d.loan.tenureMonths} months`],
        ['Purpose', d.loan.purpose],
      ],
    ],
    [
      SECTION_LABEL.address,
      [
        ['Address', d.address.line],
        ['Village', d.address.village],
        ['Taluka', d.address.taluka],
        ['District', d.address.district],
        ['PIN', d.address.pincode],
      ],
    ],
    [
      SECTION_LABEL.financial,
      [
        ['Occupation', d.financial.occupation],
        ['Declared annual income', formatMoney(d.financial.declaredAnnualIncomeMinor)],
        ['Existing liabilities', formatMoney(d.financial.existingLiabilitiesMinor)],
      ],
    ],
    [
      SECTION_LABEL.collateral,
      [
        ['Survey / Gat no.', d.collateral.surveyNumber],
        [
          'Land area',
          d.collateral.landArea === '' ? '' : `${d.collateral.landArea} ${d.collateral.landUnit}`,
        ],
        ['Warehouse receipt', d.collateral.warehouseReceiptNo],
        ['Collateral value', formatMoney(d.collateral.collateralValueMinor)],
      ],
    ],
    [
      SECTION_LABEL.business,
      [
        ['Business name', d.business.businessName],
        ['Registration', d.business.registrationNo],
        ['GSTIN', d.business.gstin],
        ['Udyam', d.business.udyamNo],
      ],
    ],
    [
      SECTION_LABEL.guarantor,
      [
        ['Name', d.guarantor.name],
        ['Relationship', d.guarantor.relation],
      ],
    ],
    [
      SECTION_LABEL.declaration,
      [
        ['Purpose declaration signed', d.declaration.purposeDeclared ? 'Yes' : 'Not recorded'],
        ['Remarks', d.declaration.remarks],
      ],
    ],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map(([title, rows]) => (
        <Card key={title} className="p-5">
          <h3 className="mb-3 font-semibold">{title}</h3>
          <dl className="space-y-1.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd
                  className="text-right font-medium break-words"
                  lang={/[ऀ-ॿ]/.test(v) ? 'mr' : undefined}
                >
                  {v === '' ? '—' : v}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}
