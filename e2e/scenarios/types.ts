/**
 * A loan-application test scenario: what is typed into the application (test inputs) and what
 * the risk analysis is expected to show. Scenarios run through tests/loan-scenarios.spec.ts.
 * Inputs are made up for testing unless a field says otherwise; never use real personal data.
 */

export type ReviewPriority = 'Routine review' | 'Needs attention' | 'Urgent review';

export interface ScenarioCustomer {
  readonly name: string;
  /** CIN when known (public), '' otherwise. */
  readonly cin: string;
  /** Rupees, digits only (e.g. '1800000' for ₹18,00,000). */
  readonly outstandingRupees: string;
  /** YYYY-MM-DD, '' when not given. */
  readonly oldestUnpaid: string;
}

export interface ScenarioInput {
  /** Option labels as shown in the form. */
  readonly borrowerType: string;
  readonly product: string;
  readonly signatory: string;
  readonly amountRupees: string;
  readonly tenureMonths: string;
  readonly business: { readonly name: string; readonly cin: string; readonly pan: string };
  readonly customers: readonly ScenarioCustomer[];
  readonly purpose: string;
  readonly remarks: string;
}

export interface ScenarioExpectation {
  /** Companies expected in the chain of unpaid dues, top to bottom; null = no chain expected. */
  readonly chain: readonly RegExp[] | null;
  /** Status badge expected somewhere in the chain (e.g. /Under Liquidation/). */
  readonly chainStatus?: RegExp;
  /** Impact on receivables: affected amount as displayed (Indian grouping) and share. */
  readonly impact?: { readonly affectedRupees: string; readonly percent: string };
  /** Title of the finding to open, and text expected in its detail drawer. */
  readonly finding?: { readonly title: RegExp; readonly detail: RegExp };
  /** Overall review priority after running checks. */
  readonly priority: ReviewPriority;
}

export interface LoanScenario {
  /** Folder name; screenshots go to screenshots/<id>/. */
  readonly id: string;
  readonly title: string;
  readonly input: ScenarioInput;
  readonly expect: ScenarioExpectation;
}
