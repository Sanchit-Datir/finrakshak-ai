import type { ApplicationData } from '../../../domain/schemas.js';
import type { MoneyInputs, ReviewErrors } from '../../../lib/review-form.js';

export type SetSection = <S extends keyof ApplicationData>(
  section: S,
  patch: Partial<ApplicationData[S]>,
) => void;

/** Props every form section of the review step receives. */
export interface SectionProps {
  data: ApplicationData;
  set: SetSection;
  errors: ReviewErrors;
  unverified: boolean;
  onToggle: () => void;
}

/** Rupee inputs stay text until save, so sections with amounts get them separately. */
export interface MoneyProps {
  money: MoneyInputs;
  setMoney: (key: keyof MoneyInputs, value: string) => void;
}
