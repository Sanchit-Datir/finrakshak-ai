import {
  APPLICATION_PRODUCTS,
  BORROWER_TYPE_LABEL,
  PRODUCT_LABEL,
} from '../../../domain/labels.js';
import {
  BorrowerTypeSchema,
  LoanProductSchema,
  type Branch,
  type BorrowerType,
  type LoanProduct,
} from '../../../domain/schemas.js';
import { SelectField } from '../../ui/Field.js';

/** Borrower type, loan product and branch: they decide which sections the form shows. */
export function ProductFields({
  borrowerType,
  onBorrowerType,
  product,
  onProduct,
  branchId,
  onBranch,
  branches,
}: {
  borrowerType: BorrowerType;
  onBorrowerType: (t: BorrowerType) => void;
  product: LoanProduct;
  onProduct: (p: LoanProduct) => void;
  branchId: string;
  onBranch: (id: string) => void;
  branches: readonly Branch[];
}): React.JSX.Element {
  return (
    <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-5">
      <SelectField
        label="Borrower type"
        value={borrowerType}
        onChange={(e) => {
          onBorrowerType(BorrowerTypeSchema.parse(e.target.value));
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
          onProduct(LoanProductSchema.parse(e.target.value));
        }}
      >
        {(APPLICATION_PRODUCTS.includes(product)
          ? APPLICATION_PRODUCTS
          : [product, ...APPLICATION_PRODUCTS]
        ).map((p) => (
          <option key={p} value={p}>
            {PRODUCT_LABEL[p]}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Branch"
        value={branchId}
        onChange={(e) => {
          onBranch(e.target.value);
        }}
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
