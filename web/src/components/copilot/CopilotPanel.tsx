import { ArrowUp, Eraser, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { buildContext, targetKey } from '../../lib/assist/context.js';
import { useCloudAuth } from '../../state/cloud-auth.js';
import { clearThread, closeCopilot, useCopilot } from '../../state/copilot.js';
import { useBranchScope } from '../../state/scope.js';
import { useSession } from '../../state/session.js';
import { useDb } from '../../state/store.js';
import { Dialog } from '../ui/Dialog.js';
import { Notice } from '../ui/States.js';
import { CopilotAnswer } from './CopilotAnswer.js';
import { TASKS_FOR } from './tasks.js';
import { useCopilotRunner } from './useCopilotRunner.js';

const MAX_QUESTION = 400;

/** FinRakshak Copilot: grounded answers about the record on screen (B-66). */
export function CopilotPanel(): React.JSX.Element {
  const { open, threads, target: shown } = useCopilot();
  const db = useDb();
  const session = useSession();
  const cloud = useCloudAuth();
  const { scope } = useBranchScope();
  const run = useCopilotRunner();
  const [question, setQuestion] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const target = shown ?? { kind: 'portfolio' as const };
  const key = targetKey(target);
  const turns = threads[key] ?? [];
  const pack = open ? buildContext(db, target, session?.name ?? '', scope) : null;
  const busy = turns.some((t) => t.status === 'running');
  const live = cloud.status === 'ready';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, busy]);

  const ask = (q: string): void => {
    const text = q.trim();
    if (text === '' || busy) return;
    run('ask', text);
    setQuestion('');
  };

  return (
    <Dialog
      open={open}
      onClose={closeCopilot}
      variant="drawer"
      title={
        <span className="flex items-center gap-2">
          <span className="from-primary to-violet grid size-7 place-items-center rounded-lg bg-gradient-to-br text-white">
            <Sparkles className="size-4" aria-hidden />
          </span>
          FinRakshak Copilot
        </span>
      }
      description={
        <>
          About <strong className="text-ink">{pack?.subject.title ?? '—'}</strong> · drafts for you
          to check, never decisions
        </>
      }
      footer={
        <form
          className="flex w-full items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <label className="sr-only" htmlFor="copilot-question">
            Ask about this record
          </label>
          <textarea
            id="copilot-question"
            rows={2}
            maxLength={MAX_QUESTION}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
            placeholder="Ask about this record… (Enter to send)"
            className="border-line bg-surface focus:border-primary min-h-11 flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={busy || question.trim() === ''}
            aria-label="Send question"
            className="bg-primary dark:text-navy-deep grid size-11 shrink-0 place-items-center rounded-xl text-white disabled:opacity-40"
          >
            <ArrowUp className="size-5" aria-hidden />
          </button>
        </form>
      }
    >
      <div className="space-y-4">
        {live ? (
          <p className="bg-ok-soft text-ok rounded-lg px-3 py-2 text-xs">
            Answers come from Gemini through a secure server function. Identifiers are masked, and
            every statement must cite this record’s data or it is removed.
          </p>
        ) : (
          <Notice tone="warn" title="Demo session: no AI model is called">
            Answers here are built from the record’s facts by fixed rules and pass the same
            grounding check. Sign in with a cloud account to use Gemini.
          </Notice>
        )}
        {pack === null ? (
          <Notice title="This record is no longer available">
            Open another record and try again.
          </Notice>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TASKS_FOR[pack.subject.kind].map((t) => (
              <button
                key={t.task}
                type="button"
                disabled={busy}
                onClick={() => {
                  run(t.task);
                }}
                className="card card-hover flex items-start gap-3 p-3 text-left disabled:opacity-50"
              >
                <span className="bg-violet-soft text-violet grid size-8 shrink-0 place-items-center rounded-lg">
                  <t.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{t.title}</span>
                  <span className="text-muted block text-xs">{t.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {turns.map((t) => (
          <CopilotAnswer key={t.id} turn={t} onFollowUp={ask} />
        ))}
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clearThread(key);
            }}
            className="text-muted hover:text-ink inline-flex items-center gap-1 text-xs font-semibold"
          >
            <Eraser className="size-3.5" aria-hidden /> Clear this conversation
          </button>
        )}
        {pack !== null && (
          <details className="border-line rounded-lg border px-3 py-2 text-xs">
            <summary className="cursor-pointer font-semibold">
              Data the copilot can use: {pack.facts.length} facts from this record, identifiers
              masked
            </summary>
            <ul className="mt-2 space-y-1">
              {pack.facts.map((f) => (
                <li key={f.ref}>
                  <span className="text-primary font-mono font-semibold">{f.ref}</span> {f.label}:{' '}
                  <span className="text-muted">{f.text}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <div ref={endRef} />
      </div>
    </Dialog>
  );
}
