import { useState } from 'react';
import type {
  Application,
  ApplicationData,
  ApplicationSection,
  BorrowerType,
  Db,
  FtDocument,
} from '../../domain/schemas.js';
import { prefillFromDocuments } from '../../lib/prefill.js';
import { rowsOf, type CustomerRow } from '../../lib/receivables.js';
import {
  BUSINESS_TYPES,
  moneyOf,
  validateReviewForm,
  type MoneyInputs,
  type ReviewErrors,
} from '../../lib/review-form.js';
import { addApplicationNote, saveApplication, toggleUnverified } from '../../state/actions.js';
import { useToast } from '../../state/toast.js';
import { ReceivablesSection } from './ReceivablesSection.js';
import { AddressSection } from './review/AddressSection.js';
import { ApplicantSection } from './review/ApplicantSection.js';
import { BusinessSection } from './review/BusinessSection.js';
import { CollateralSection } from './review/CollateralSection.js';
import { DeclarationSection } from './review/DeclarationSection.js';
import { FinancialSection } from './review/FinancialSection.js';
import { GuarantorSection } from './review/GuarantorSection.js';
import { LoanSection } from './review/LoanSection.js';
import { NoteDialog } from './review/NoteDialog.js';
import { ProductFields } from './review/ProductFields.js';
import { ReviewActions } from './review/ReviewActions.js';
import { ReviewHeader } from './review/ReviewHeader.js';
import type { SectionProps, SetSection } from './review/types.js';

const FIX_FIELDS = {
  tone: 'error',
  title: 'Please fix the highlighted fields',
  detail: 'Your entries have not been lost.',
} as const;

/** Step 3: the typed-in application form, pre-filled from reviewed document fields. */
export function ReviewStep({
  app,
  docs,
  db,
  actor,
  ensureApp,
  requireCoreFields,
  onBack,
  onContinue,
  onAttach,
}: {
  /** The application, or an unsaved blank one (id '') until the first save. */
  app: Application;
  docs: FtDocument[];
  db: Db;
  actor: string;
  /** Returns the stored application's id, creating the draft on first use. */
  ensureApp: () => string;
  /** Name, amount and purpose are required on the form path; the upload path needs nothing. */
  requireCoreFields: boolean;
  onBack?: () => void;
  onContinue: (appId: string) => void;
  onAttach: () => void;
}): React.JSX.Element {
  const toast = useToast();
  const [initial] = useState(() => {
    const blank = app.data.applicant.fullName === '' && app.data.loan.purpose === '';
    return blank ? prefillFromDocuments(app.data, docs) : { data: app.data, changes: [] };
  });
  const [data, setData] = useState<ApplicationData>(initial.data);
  const [money, setMoneyState] = useState<MoneyInputs>(() => moneyOf(initial.data));
  const [customerRows, setCustomerRows] = useState<CustomerRow[]>(() =>
    rowsOf(initial.data.receivables.customers),
  );
  const [customerErrors, setCustomerErrors] = useState<Record<number, string>>({});
  const [borrowerType, setBorrowerType] = useState<BorrowerType>(app.borrowerType);
  const [branchId, setBranchId] = useState(app.branchId);
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [prefillNote, setPrefillNote] = useState(initial.changes);
  const [noteOpen, setNoteOpen] = useState(false);

  const set: SetSection = (section, patch) => {
    setData((d) => ({ ...d, [section]: { ...d[section], ...patch } }));
  };
  const setMoney = (key: keyof MoneyInputs, value: string): void => {
    setMoneyState((m) => ({ ...m, [key]: value }));
  };
  const sectionProps = (s: ApplicationSection): SectionProps => ({
    data,
    set,
    errors,
    unverified: app.unverifiedSections.includes(s),
    onToggle: () => {
      toggleUnverified(ensureApp(), actor, s);
    },
  });
  const unreviewed = docs.reduce(
    (n, d) => n + d.fields.filter((f) => f.state === 'unreviewed').length,
    0,
  );

  const build = (strict: boolean): ApplicationData | null => {
    const r = validateReviewForm({ data, money, customerRows, strict, requireCoreFields });
    setCustomerErrors(r.customerErrors);
    setErrors(r.errors);
    return r.data;
  };

  const save = (next: 'stay' | 'continue'): void => {
    const built = build(next === 'continue');
    if (built === null) {
      toast.push(FIX_FIELDS);
      return;
    }
    const id = ensureApp();
    saveApplication(
      id,
      actor,
      { data: built, borrowerType, branchId, step: next === 'continue' ? 4 : 3 },
      next === 'continue' ? 'Application reviewed; continuing to risk analysis' : 'Draft saved',
    );
    if (next === 'continue') onContinue(id);
    else
      toast.push({
        tone: 'success',
        title: 'Draft saved',
        detail: `${id} — you can return to it from Loan applications.`,
      });
  };

  /** Keeps what was typed (as a draft) before switching to the document upload. */
  const attach = (): void => {
    const built = build(false);
    if (built === null) {
      toast.push(FIX_FIELDS);
      return;
    }
    const changed =
      JSON.stringify(built) !== JSON.stringify(app.data) ||
      borrowerType !== app.borrowerType ||
      branchId !== app.branchId;
    if (changed) saveApplication(ensureApp(), actor, { data: built, borrowerType, branchId });
    onAttach();
  };

  const refill = (): void => {
    const r = prefillFromDocuments(data, docs);
    setData(r.data);
    setMoneyState(moneyOf(r.data));
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

  const isBusiness = BUSINESS_TYPES.has(borrowerType);
  const product = data.loan.product;
  const agri = borrowerType === 'farmer' || product === 'kcc_crop' || product === 'agri_term';
  const moneyProps = { money, setMoney };

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      <ReviewHeader
        errors={Object.values(errors)}
        requireCoreFields={requireCoreFields}
        hasDocs={docs.length > 0}
        prefillNote={prefillNote}
        unreviewed={unreviewed}
        onAttach={attach}
        onRefill={refill}
        onAddNote={() => {
          setNoteOpen(true);
        }}
      />
      <ProductFields
        borrowerType={borrowerType}
        onBorrowerType={setBorrowerType}
        product={product}
        onProduct={(p) => {
          set('loan', { product: p });
        }}
        branchId={branchId}
        onBranch={setBranchId}
        branches={db.branches}
      />
      <ApplicantSection {...sectionProps('applicant')} required={requireCoreFields} />
      <LoanSection {...sectionProps('loan')} {...moneyProps} required={requireCoreFields} />
      <AddressSection {...sectionProps('address')} />
      <FinancialSection {...sectionProps('financial')} {...moneyProps} />
      <CollateralSection {...sectionProps('collateral')} {...moneyProps} agri={agri} />
      {isBusiness && <BusinessSection {...sectionProps('business')} borrowerType={borrowerType} />}
      {isBusiness && (
        <ReceivablesSection
          rows={customerRows}
          errors={customerErrors}
          unverified={app.unverifiedSections.includes('receivables')}
          onToggle={sectionProps('receivables').onToggle}
          onChange={setCustomerRows}
        />
      )}
      <GuarantorSection {...sectionProps('guarantor')} />
      <DeclarationSection {...sectionProps('declaration')} required={requireCoreFields} />
      <ReviewActions
        onBack={onBack}
        onSaveDraft={() => {
          save('stay');
        }}
        onContinue={() => {
          save('continue');
        }}
      />
      <NoteDialog
        open={noteOpen}
        onClose={() => {
          setNoteOpen(false);
        }}
        onAdd={(note) => {
          addApplicationNote(ensureApp(), actor, note);
          setNoteOpen(false);
          toast.push({ tone: 'success', title: 'Note added' });
        }}
      />
    </div>
  );
}
