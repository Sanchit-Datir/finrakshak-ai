import type { AssistCheck } from '@finrakshak-ai/shared';
import { ArrowUpRight, Copy, ShieldCheck, ShieldAlert, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { CopilotTurn, TurnSource } from '../../state/copilot.js';
import { useToast } from '../../state/toast.js';
import { cn } from '../ui/cn.js';
import { Notice, Skeleton } from '../ui/States.js';
import { TASK_LABEL } from './tasks.js';

const SOURCE: Record<TurnSource, { label: string; tone: string }> = {
  gemini: { label: 'Gemini · grounded', tone: 'bg-ok-soft text-ok' },
  mock: { label: 'Mock provider · no model called', tone: 'bg-warn-soft text-warn' },
  simulated: { label: 'Simulated demo output · no model called', tone: 'bg-warn-soft text-warn' },
};

function CheckStrip({ check }: { check: AssistCheck }): React.JSX.Element {
  const dropped = check.droppedUncited + check.droppedNumbers + check.droppedWording;
  const parts = [
    check.droppedUncited > 0 ? `${String(check.droppedUncited)} without a source` : '',
    check.droppedNumbers > 0
      ? `${String(check.droppedNumbers)} with a number not in the record`
      : '',
    check.droppedWording > 0 ? `${String(check.droppedWording)} with verdict wording` : '',
  ].filter(Boolean);
  const Icon = dropped === 0 ? ShieldCheck : ShieldAlert;
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2 text-xs',
        dropped === 0 ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn',
      )}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <p>
        <strong>Grounding check:</strong> {check.kept} of {check.received} statements kept. Each
        cites this record’s data and every number was found in its source.
        {dropped > 0 && <> Removed: {parts.join(', ')}.</>}
      </p>
    </div>
  );
}

/** One copilot answer: statements with their citations, the check result, and follow-ups. */
export function CopilotAnswer({
  turn,
  onFollowUp,
}: {
  turn: CopilotTurn;
  onFollowUp: (question: string) => void;
}): React.JSX.Element {
  const toast = useToast();
  const [openRef, setOpenRef] = useState<string | null>(null);
  const facts = new Map(turn.facts.map((f) => [f.ref, f]));
  const result = turn.result;

  const copy = (): void => {
    if (result === null) return;
    const text = [
      result.headline,
      ...result.statements.map((s) => `• ${s.text} [${s.refs.join(', ')}]`),
      `(${SOURCE[turn.source].label}; a draft for a person to check, not a decision)`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(
      () => {
        toast.push({ tone: 'success', title: 'Copied to clipboard' });
      },
      () => {
        toast.push({ tone: 'error', title: 'Could not copy', detail: 'Select the text instead.' });
      },
    );
  };

  return (
    <article className="border-line bg-surface rounded-xl border p-4 shadow-[var(--shadow-card)]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="bg-violet-soft text-violet inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
          <Sparkles className="size-3" aria-hidden /> {TASK_LABEL[turn.task]}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            SOURCE[turn.source].tone,
          )}
        >
          {SOURCE[turn.source].label}
        </span>
      </div>
      {turn.question !== '' && <p className="text-muted mb-2 text-sm italic">“{turn.question}”</p>}
      {turn.status === 'running' && (
        <div className="space-y-2" aria-live="polite">
          <span className="sr-only">Working on it</span>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
      {turn.status === 'error' && (
        <Notice tone="danger" title="The copilot did not answer">
          {turn.error ?? 'Try again.'}
        </Notice>
      )}
      {result !== null && (
        <div className="space-y-3">
          <h3 className="text-[15px] font-semibold">{result.headline}</h3>
          {result.statements.length === 0 ? (
            <p className="text-muted text-sm">
              No statement passed the grounding check, so nothing is shown. Try a narrower question.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {result.statements.map((s, i) => (
                <li key={`${String(i)}-${s.text.slice(0, 20)}`} className="text-sm leading-relaxed">
                  <span>{s.text}</span>{' '}
                  {s.refs.map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-expanded={openRef === `${String(i)}:${r}`}
                      onClick={() => {
                        setOpenRef(openRef === `${String(i)}:${r}` ? null : `${String(i)}:${r}`);
                      }}
                      title={facts.get(r)?.label}
                      className="bg-primary-soft text-primary hover:bg-primary hover:text-white dark:hover:text-navy-deep mr-1 rounded px-1.5 py-px align-baseline font-mono text-[10.5px] font-semibold"
                    >
                      {r}
                    </button>
                  ))}
                  {s.refs.map((r) => {
                    const f = facts.get(r);
                    if (openRef !== `${String(i)}:${r}` || f === undefined) return null;
                    const href = turn.links[r];
                    return (
                      <div
                        key={`src-${r}`}
                        className="border-primary bg-surface-2 mt-1.5 rounded-r-lg border-l-2 px-3 py-2 text-xs"
                      >
                        <p className="font-semibold">
                          {r} · {f.label}
                        </p>
                        <p className="text-muted mt-0.5">{f.text}</p>
                        {href !== undefined && (
                          <Link
                            to={href}
                            className="text-primary mt-1 inline-flex items-center gap-1 font-semibold hover:underline"
                          >
                            Open source <ArrowUpRight className="size-3" aria-hidden />
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </li>
              ))}
            </ol>
          )}
          <CheckStrip check={result.check} />
          <div className="flex flex-wrap items-center gap-2">
            {result.followUps.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  onFollowUp(q);
                }}
                className="border-line text-ink hover:border-primary hover:text-primary rounded-full border px-3 py-1 text-xs"
              >
                {q}
              </button>
            ))}
            <button
              type="button"
              onClick={copy}
              className="text-muted hover:text-ink ml-auto inline-flex items-center gap-1 text-xs font-semibold"
            >
              <Copy className="size-3.5" aria-hidden /> Copy
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
