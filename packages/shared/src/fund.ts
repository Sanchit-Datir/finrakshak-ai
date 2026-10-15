import { z } from 'zod';
import { MoneySchema } from './money.js';

export const FundSchema = z.object({
  id: z.string().min(1),
  ownerUid: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  target: MoneySchema.nullable(),
  createdAt: z.string().datetime(),
});
export type Fund = z.infer<typeof FundSchema>;

export const CreateFundInputSchema = FundSchema.pick({ name: true, target: true });
export type CreateFundInput = z.infer<typeof CreateFundInputSchema>;
