import { ArrowLeft, ArrowRight, FileText, MessageSquarePlus, RefreshCw, Save } from 'lucide-react';
import { useState } from 'react';
import { BORROWER_TYPE_LABEL, PRODUCT_LABEL, SECTION_LABEL } from '../../domain/labels.js';
import {
  BorrowerTypeSchema,
  LandUnitSchema,
  LoanProductSchema,
  type Application,
  type ApplicationData,
  type ApplicationSection,
  type BorrowerType,
  type Db,
  type FtDocument,
} from '../../domain/schemas.js';
import { LAND_UNIT_LABEL } from '../../lib/land.js';
import { minorToRupeeInput, parseRupeesToMinor } from '../../lib/format.js';
import { prefillFromDocuments } from '../../lib/prefill.js';
import { addApplicationNote, saveApplication, toggleUnverified } from '../../state/actions.js';
import { useToast } from '../../state/toast.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Checkbox, SelectField, TextArea, TextField } from '../ui/Field.js';
import { Notice } from '../ui/States.js';
import { cn } from '../ui/cn.js';

interface Money {
  amount: string;
  income: string;
  liabilities: string;
  collateral: string;
}
type Errors = Partial<
  Record<'fullName' | 'amount' | 'purpose' | 'income' | 'liabilities' | 'collateral', string>
>;

const BUSINESS_TYPES: ReadonlySet<BorrowerType> = new Set([
  'proprietorship',
  'partnership',
  'private_limited',
  'other',
]);

function moneyOf(d: ApplicationData): Money {
  return {
    amount: minorToRupeeInput(d.loan.amountMinor),
    income: minorToRupeeInput(d.financial.declaredAnnualIncomeMinor),
    liabilities: minorToRupeeInput(d.financial.existingLiabilitiesMinor),
    collateral: minorToRupeeInput(d.collateral.collateralValueMinor),
  };
}

function Section({
  title,
  unverified,
  onToggle,
  children,
}: {
  id: ApplicationSection;
  title: string;
  unverified: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <fieldset className={cn('card p-4 sm:p-5', unverified && 'border-warn')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <legend className="text-[16px] font-semibold">{title}</legend>
        <Checkbox label="Mark information unverified" checked={unverified} onChange={onToggle} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ReviewStep({
  app,
  docs,
  db,
  actor,
  onBack,
  onContinue,
  onAttach,
}: {
  app: Application;
  docs: FtDocument[];
  db: Db;
  actor: string;
  onBack: () => void;
  onContinue: () => void;
  onAttach: () => void;
}): React.JSX.Element {
  const toast = useToast();
  const [initial] = useState(() => {
    const blank = app.data.applicant.fullName === '' && app.data.loan.purpose === '';
    return blank ? prefillFromDocuments(app.data, docs) : { data: app.data, changes: [] };
  });
  const [data, setData] = useState<ApplicationData>(initial.data);
  const [money, setMoney] = useState<Money>(() => moneyOf(initial.data));
  const [borrowerType, setBorrowerType] = useState<BorrowerType>(app.borrowerType);
  const [branchId, setBranchId] = useState(app.branchId);
  const [errors, setErrors] = useState<Errors>({});
  const [prefillNote, setPrefillNote] = useState(initial.changes);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');

  const set = <S extends keyof ApplicationData>(
    section: S,
    patch: Partial<ApplicationData[S]>,
  ): void => {
    setData((d) => ({ ...d, [section]: { ...d[section], ...patch } }));
  };
  const unv = (s: ApplicationSection): boolean => app.unverifiedSections.includes(s);
  const toggle = (s: ApplicationSection) => (): void => {
    toggleUnverified(app.id, actor, s);
  };
  const unreviewed = docs.reduce(
    (n, d) => n + d.fields.filter((f) => f.state === 'unreviewed').length,
    0,
  );

  const build = (strict: boolean): ApplicationData | null => {
    const e: Errors = {};
    const parse = (raw: string, key: keyof Errors, required: boolean): number | null => {
      if (raw.trim() === '') {
        if (required) e[key] = 'Enter an amount.';
        return null;
      }
      const v = parseRupeesToMinor(raw);
      if (v === null) e[key] = 'Enter rupees using digits only, e.g. 150000 or 1,50,000.50';
      return v;
    };
    const amount = parse(money.amount, 'amount', strict);
    const income = parse(money.income, 'income', false);
    const liabilities = parse(money.liabilities, 'liabilities', false);
    const collateral = parse(money.collateral, 'collateral', false);
    if (strict && data.applicant.fullName.trim() === '') e.fullName = 'Enter the applicant name.';
    if (strict && data.loan.purpose.trim() === '') e.purpose = 'Enter the declared loan purpose.';
    setErrors(e);
    if (Object.keys(e).length > 0) return null;
    return {
      ...data,
      loan: { ...data.loan, amountMinor: amount },
      financial: {
        ...data.financial,
        declaredAnnualIncomeMinor: income,
        existingLiabilitiesMinor: liabilities,
      },
      collateral: { ...data.collateral, collateralValueMinor: collateral },
    };
  };

  const save = (next: 'stay' | 'continue'): void => {
    const built = build(next === 'continue');
    if (built === null) {
      toast.push({
        tone: 'error',
        title: 'Please fix the highlighted fields',
        detail: 'Your entries have not been lost.',
      });
      return;
    }
    saveApplication(
      app.id,
      actor,
      { data: built, borrowerType, branchId, step: next === 'continue' ? 4 : 3 },
      next === 'continue' ? 'Application reviewed; continuing to risk analysis' : 'Draft saved',
    );
    if (next === 'continue') onContinue();
    else
      toast.push({
        tone: 'success',
        title: 'Draft saved',
        detail: `${app.id} — you can return to it from Loan applications.`,
      });
  };

  const refill = (): void => {
    const r = prefillFromDocuments(data, docs);
    setData(r.data);
    setMoney(moneyOf(r.data));
    setPrefillNote(r.changes);
    toast.push({
      tone: r.changes.length > 0 ? 'success' : 'info',
      title:
        r.changes.length > 0
          ? `${r.changes.length} empty field(s) filled from reviewed documents`
          : 'Nothing new to fill',
      detail: 'Only confirmed or corrected document fields are used.',
    });
  };

  const errorList = Object.values(errors);
  const isBusiness = BUSINESS_TYPES.has(borrowerType);
  const product = data.loan.product;
  const agri = borrowerType === 'farmer' || product === 'kcc_crop' || product === 'agri_term';

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      {errorList.length > 0 && (
        <Notice tone="danger" title="Some information needs attention">
          <ul className="list-disc pl-4">
            {errorList.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={RefreshCw} onClick={refill}>
          Fill empty fields from reviewed documents
        </Button>
        <Button
          size="sm"
          icon={MessageSquarePlus}
          onClick={() => {
            setNoteOpen(true);
          }}
        >
          Add a note
        </Button>
        <Button size="sm" icon={FileText} onClick={onAttach}>
          Replace / attach a document
        </Button>
      </div>
      {prefillNote.length > 0 && (
        <Notice title={`${prefillNote.length} field(s) were filled from reviewed document fields`}>
          <ul className="mt-1 space-y-0.5 text-xs">
            {prefillNote.map((c) => (
              <li key={c.path}>
                {c.label}: <span lang="mr">“{c.value}”</span> — from {c.source}
              </li>
            ))}
          </ul>
          Check each value; you can edit anything below.
        </Notice>
      )}
      {unreviewed > 0 && (
        <Notice tone="warn">
          {unreviewed} extracted field(s) are still unreviewed and were not used. Review them in
          “Extract & verify”.
        </Notice>
      )}

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-5">
        <SelectField
          label="Borrower type"
          value={borrowerType}
          onChange={(e) => {
            setBorrowerType(BorrowerTypeSchema.parse(e.target.value));
          }}
        >
          {BorrowerTypeSchema.options.map((t) => (
            <option key={t} value={t}>
              {BORROWER_TYPE_LABEL[t]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Loan product"
          value={product}
          onChange={(e) => {
            set('loan', { product: LoanProductSchema.parse(e.target.value) });
          }}
        >
          {LoanProductSchema.options.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_LABEL[p]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Branch"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
          }}
        >
          {db.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      </div>

      <Section
        id="applicant"
        title={SECTION_LABEL.applicant}
        unverified={unv('applicant')}
        onToggle={toggle('applicant')}
      >
        <TextField
          label="Full name (English / transliterated)"
          required
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
      </Section>

      <Section
        id="loan"
        title={SECTION_LABEL.loan}
        unverified={unv('loan')}
        onToggle={toggle('loan')}
      >
        <TextField
          label="Requested amount (₹)"
          required
          inputMode="decimal"
          value={money.amount}
          error={errors.amount ?? null}
          onChange={(e) => {
            setMoney((m) => ({ ...m, amount: e.target.value }));
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
      </Section>

      <Section
        id="address"
        title={SECTION_LABEL.address}
        unverified={unv('address')}
        onToggle={toggle('address')}
      >
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
      </Section>

      <Section
        id="financial"
        title={SECTION_LABEL.financial}
        unverified={unv('financial')}
        onToggle={toggle('financial')}
      >
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
            setMoney((m) => ({ ...m, income: e.target.value }));
          }}
        />
        <TextField
          label="Existing liabilities (₹)"
          inputMode="decimal"
          value={money.liabilities}
          error={errors.liabilities ?? null}
          onChange={(e) => {
            setMoney((m) => ({ ...m, liabilities: e.target.value }));
          }}
        />
      </Section>

      <Section
        id="collateral"
        title={SECTION_LABEL.collateral}
        unverified={unv('collateral')}
        onToggle={toggle('collateral')}
      >
        {agri && (
          <>
            <TextField
              label="Survey / Gat number (as written)"
              hint="Marathi digits are kept as entered."
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
        {product === 'warehouse_receipt' && (
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
            setMoney((m) => ({ ...m, collateral: e.target.value }));
          }}
        />
      </Section>

      {isBusiness && (
        <Section
          id="business"
          title={SECTION_LABEL.business}
          unverified={unv('business')}
          onToggle={toggle('business')}
        >
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
        </Section>
      )}

      <Section
        id="guarantor"
        title={SECTION_LABEL.guarantor}
        unverified={unv('guarantor')}
        onToggle={toggle('guarantor')}
      >
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
      </Section>

      <Section
        id="declaration"
        title={SECTION_LABEL.declaration}
        unverified={unv('declaration')}
        onToggle={toggle('declaration')}
      >
        <TextArea
          label="Declared loan purpose"
          required
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
      </Section>

      <div className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
        <Button icon={ArrowLeft} onClick={onBack}>
          Previous step
        </Button>
        <Button
          icon={Save}
          onClick={() => {
            save('stay');
          }}
          className="ml-auto"
        >
          Save draft
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            save('continue');
          }}
        >
          Continue to risk analysis <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>

      <Dialog
        open={noteOpen}
        onClose={() => {
          setNoteOpen(false);
        }}
        title="Add a note"
        footer={
          <>
            <Button
              onClick={() => {
                setNoteOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={note.trim() === ''}
              onClick={() => {
                addApplicationNote(app.id, actor, note.trim());
                setNote('');
                setNoteOpen(false);
                toast.push({ tone: 'success', title: 'Note added' });
              }}
            >
              Add note
            </Button>
          </>
        }
      >
        <TextArea
          label="Note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </Dialog>
    </div>
  );
}
