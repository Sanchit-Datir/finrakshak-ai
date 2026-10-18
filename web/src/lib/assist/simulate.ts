import {
  groundAssist,
  type AssistFact,
  type AssistInput,
  type AssistResult,
  type AssistTask,
  type RawAssistReply,
} from '@fund-tracker/shared';

/**
 * Demo-session copilot: builds an answer from the record's own facts with fixed rules. No model is
 * called, and the UI labels every answer "Simulated demo output" (spec §1). The answer still goes
 * through the same grounding check as a real model's answer (B-66), so the counts shown are honest.
 */

export const TASK_HEADLINE: Record<AssistTask, string> = {
  explain: 'Why this needs attention',
  next_steps: 'Checks to do next',
  draft_request: 'Draft request for information',
  memo: 'Draft risk observations',
  money_trail: 'Where the money went',
  ask: 'Answer from the record',
};

const sentences = (s: string): string[] =>
  s.split(/(?<=[.!?])\s+(?=[A-Z₹"'(])/).map((x) => x.trim()).filter(Boolean);
const firstSentence = (s: string): string => sentences(s)[0] ?? s.trim();
/** Findings and alerts start with their priority ("Urgent review. …"); lead with the detail. */
function lead(f: AssistFact): string {
  const [priority = '', detail = ''] = sentences(f.text);
  const p = priority.replace(/[.;].*$/, '');
  return detail === '' ? `${f.label} (${p})` : `${f.label} (${p}). ${detail}`;
}
const of = (facts: AssistFact[], ...kinds: AssistFact['kind'][]): AssistFact[] =>
  facts.filter((f) => kinds.includes(f.kind));
const say = (text: string, ...refs: string[]): RawAssistReply['statements'][number] => ({
  text,
  refs,
});
const subjectRef = (facts: AssistFact[]): string => facts[0]?.ref ?? 'S1';

function explain(facts: AssistFact[]): RawAssistReply['statements'] {
  const leads = of(facts, 'finding', 'alert').filter((f) => f.label !== 'Possible harmless reason');
  if (leads.length === 0)
    return [
      say(
        'No configured check raised an item in the data available for this record. This is not a guarantee of safety.',
        subjectRef(facts),
      ),
    ];
  const out = leads.slice(0, 4).map((f) => say(lead(f), f.ref));
  const harmless = facts.find(
    (f) => f.label === 'Possible harmless reason' || f.text.includes('Possible harmless reason:'),
  );
  if (harmless !== undefined) {
    const reason = harmless.text.split('Possible harmless reason:')[1] ?? harmless.text;
    out.push(say(`A harmless explanation is possible: ${reason.trim()}`, harmless.ref));
  }
  return out;
}

function nextSteps(facts: AssistFact[]): RawAssistReply['statements'] {
  const steps = of(facts, 'step').slice(0, 5);
  if (steps.length === 0)
    return [say('No check to do is listed for this record yet.', subjectRef(facts))];
  return steps.map((s) => {
    const finding = /\b([A-Z]{1,2}\d{1,3})\b/.exec(s.label)?.[1];
    return say(s.text, ...(finding === undefined ? [s.ref] : [s.ref, finding]));
  });
}

function draftRequest(input: AssistInput): RawAssistReply['statements'] {
  const s = subjectRef(input.facts);
  const items = of(input.facts, 'finding', 'alert')
    .filter((f) => f.label !== 'Possible harmless reason')
    .slice(0, 4)
    .map((f) => say(`Please help us clarify the following: ${f.label.toLowerCase()}.`, f.ref));
  return [
    say(`As part of our review of ${input.subject.title}, we need a few more details from you.`, s),
    ...(items.length > 0
      ? items
      : [say('Please share your latest bank statement and any updated documents.', s)]),
    say('You can share these at your branch or reply to this message. Thank you.', s),
  ];
}

function memo(facts: AssistFact[]): RawAssistReply['statements'] {
  const s = subjectRef(facts);
  const subject = facts[0];
  const leads = of(facts, 'finding', 'alert', 'record')
    .filter((f) => f.label !== 'Possible harmless reason')
    .slice(0, 3);
  const steps = of(facts, 'step').slice(0, 2);
  return [
    ...(subject === undefined ? [] : [say(firstSentence(subject.text), s)]),
    ...leads.map((f) => say(`Observation: ${lead(f)}`, f.ref)),
    ...steps.map((f) => say(`Open question: ${f.text}`, f.ref)),
    say(
      'These observations are leads for verification; the decision stays with the sanctioning authority.',
      s,
    ),
  ];
}

function moneyTrail(facts: AssistFact[]): RawAssistReply['statements'] {
  const txns = of(facts, 'transaction').slice(0, 6);
  if (txns.length === 0)
    return [say('No transaction records are available for this record.', subjectRef(facts))];
  const out = txns.map((t) => say(`On ${t.label}: ${t.text}.`, t.ref));
  const rule = of(facts, 'metric', 'alert')[0];
  if (rule !== undefined) out.push(say(`This matches a monitoring rule: ${rule.label}.`, rule.ref));
  return out;
}

const STOP = new Set(['what', 'which', 'when', 'where', 'there', 'this', 'that', 'with', 'from', 'have', 'does', 'about']);

function answer(input: AssistInput): RawAssistReply['statements'] {
  const words = input.question
    .toLowerCase()
    .split(/[^a-z0-9₹]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  const scored = input.facts
    .map((f) => {
      const hay = `${f.label} ${f.text}`.toLowerCase();
      return { f, score: words.filter((w) => hay.includes(w)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (scored.length === 0)
    return [
      say('The record does not contain information that answers this question.', subjectRef(input.facts)),
    ];
  return scored.map(({ f }) => say(`${f.label}: ${firstSentence(f.text)}`, f.ref));
}

const FOLLOW_UPS: Record<AssistInput['subject']['kind'], string[]> = {
  portfolio: ['Which loans need attention first?', 'What changed this week?'],
  application: ['What documents are still missing?', 'Is the declared income supported?'],
  borrower: ['Does this borrower have open alerts?', 'How are their loans performing?'],
  loan: ['Who received the money after disbursement?', 'Are there public records after disbursement?'],
  alert: ['What could explain this harmlessly?', 'Which transactions triggered this?'],
  case: ['What evidence is still unverified?', 'What should go in the case note?'],
};

function statementsFor(input: AssistInput): RawAssistReply['statements'] {
  switch (input.task) {
    case 'explain':
      return explain(input.facts);
    case 'next_steps':
      return nextSteps(input.facts);
    case 'draft_request':
      return draftRequest(input);
    case 'memo':
      return memo(input.facts);
    case 'money_trail':
      return moneyTrail(input.facts);
    case 'ask':
      return answer(input);
  }
}

export function simulateAssist(input: AssistInput, now: Date = new Date()): AssistResult {
  const grounded = groundAssist(
    input,
    {
      headline: TASK_HEADLINE[input.task],
      statements: statementsFor(input),
      followUps: FOLLOW_UPS[input.subject.kind],
    },
    TASK_HEADLINE[input.task],
  );
  return { ...grounded, mock: true, model: null, generatedAt: now.toISOString(), remainingToday: null };
}
