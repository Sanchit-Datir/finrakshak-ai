import type { InvestigationQuestion } from '@finrakshak-ai/shared';
import { Check } from 'lucide-react';
import { useState } from 'react';
import type { ApprovedQuestion } from '../../domain/schemas.js';
import { approveInvestigationQuestion } from '../../state/actions.js';
import { useFormat } from '../../state/hooks.js';
import { useToast } from '../../state/toast.js';
import { Button } from '../ui/Button.js';
import { TextArea } from '../ui/Field.js';

const MAX_CHARS = 300;

/** A draft request-for-information question: the officer edits and approves it; nothing is sent. */
export function InvestigationQuestionItem({
  appId,
  actor,
  question,
  gapLabel,
  approved,
  disabled,
}: {
  appId: string;
  actor: string;
  question: InvestigationQuestion;
  /** The field label (or section name) the question is about. */
  gapLabel: string;
  approved: ApprovedQuestion | null;
  /** Out-of-date investigations cannot be approved from. */
  disabled: boolean;
}): React.JSX.Element {
  const f = useFormat();
  const toast = useToast();
  const [text, setText] = useState(question.question);
  const error = text.trim() === '' ? 'Write the question before approving it.' : null;
  if (approved !== null)
    return (
      <li className="border-line rounded-lg border p-3">
        <p>{approved.text}</p>
        <p className="text-ok mt-1 flex items-center gap-1 text-xs">
          <Check className="size-3.5" aria-hidden /> Approved by {approved.by},{' '}
          {f.dateTime(approved.at)}. Recorded as a note; nothing was sent to the applicant.
        </p>
      </li>
    );
  return (
    <li className="border-line rounded-lg border p-3">
      <TextArea
        label={`Draft question (about: ${gapLabel})`}
        hint="Drafted by AI. Edit it if needed, then approve it."
        value={text}
        maxLength={MAX_CHARS}
        error={error}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <Button
        className="mt-2"
        size="sm"
        icon={Check}
        disabled={disabled || error !== null}
        onClick={() => {
          approveInvestigationQuestion(appId, actor, question.id, text.trim());
          toast.push({
            tone: 'success',
            title: 'Question approved',
            detail: 'Recorded as a note. No message was sent — notifications are not connected.',
          });
        }}
      >
        Approve question
      </Button>
    </li>
  );
}
