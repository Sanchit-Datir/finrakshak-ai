import type { AssistSubjectKind, AssistTask } from '@finrakshak-ai/shared';
import { FileText, ListChecks, Mail, Route, ScanSearch, type LucideIcon } from 'lucide-react';

export const TASK_LABEL: Record<AssistTask, string> = {
  explain: 'Explain',
  next_steps: 'Next checks',
  draft_request: 'Draft request',
  memo: 'Draft memo',
  money_trail: 'Money trail',
  ask: 'Question',
};

export interface TaskOption {
  task: AssistTask;
  title: string;
  hint: string;
  icon: LucideIcon;
}

const EXPLAIN: TaskOption = {
  task: 'explain',
  title: 'Why was this flagged?',
  hint: 'The leads, most serious first, with any harmless explanation',
  icon: ScanSearch,
};
const NEXT: TaskOption = {
  task: 'next_steps',
  title: 'What should I verify next?',
  hint: 'Checks tied to the evidence that needs them',
  icon: ListChecks,
};
const REQUEST: TaskOption = {
  task: 'draft_request',
  title: 'Draft an information request',
  hint: 'A polite note to the borrower, ready to edit',
  icon: Mail,
};
const MEMO: TaskOption = {
  task: 'memo',
  title: 'Draft risk observations',
  hint: 'For the credit appraisal note or case file',
  icon: FileText,
};
const TRAIL: TaskOption = {
  task: 'money_trail',
  title: 'Where did the money go?',
  hint: 'Transfers after disbursement, in time order',
  icon: Route,
};

/** One-click tasks that make sense for each kind of record. */
export const TASKS_FOR: Record<AssistSubjectKind, TaskOption[]> = {
  portfolio: [
    { ...EXPLAIN, title: 'What needs attention today?', hint: 'The most urgent leads in scope' },
    { ...NEXT, title: 'Plan my next checks', hint: 'Suggested actions, most urgent first' },
  ],
  application: [EXPLAIN, NEXT, REQUEST, MEMO],
  borrower: [{ ...EXPLAIN, title: 'Summarise this borrower’s risk' }, NEXT, MEMO],
  loan: [EXPLAIN, TRAIL, NEXT, MEMO],
  alert: [EXPLAIN, NEXT, TRAIL, REQUEST],
  case: [
    { ...EXPLAIN, title: 'Summarise this case' },
    NEXT,
    { ...MEMO, title: 'Draft a case note' },
  ],
};
