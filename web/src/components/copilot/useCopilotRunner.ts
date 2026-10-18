import type { AssistInput, AssistTask } from '@finrakshak-ai/shared';
import { buildContext, targetKey } from '../../lib/assist/context.js';
import { simulateAssist } from '../../lib/assist/simulate.js';
import { assistRecord, explainAssistError } from '../../lib/cloud/assist.js';
import { useCloudAuth } from '../../state/cloud-auth.js';
import { currentTarget, putTurn, type CopilotTurn } from '../../state/copilot.js';
import { useBranchScope } from '../../state/scope.js';
import { useSession } from '../../state/session.js';
import { getDb } from '../../state/store.js';

let seq = 0;
const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Runs one copilot task on the current record. Signed in with a cloud account, the facts go to the
 * `assistRecord` function (Gemini, grounding check on the server). In a demo session nothing leaves
 * the browser: the answer is simulated from the same facts and labelled as such.
 */
export function useCopilotRunner(): (task: AssistTask, question?: string) => void {
  const cloud = useCloudAuth();
  const session = useSession();
  const { scope } = useBranchScope();
  const me = session?.name ?? '';

  const run = async (task: AssistTask, question: string): Promise<void> => {
    const target = currentTarget();
    const pack = buildContext(getDb(), target, me, scope);
    if (pack === null) return;
    const input: AssistInput = {
      task,
      subject: pack.subject,
      question: question.trim().slice(0, 400),
      facts: pack.facts,
    };
    seq += 1;
    const turn: CopilotTurn = {
      id: `turn-${String(seq)}`,
      task,
      question: input.question,
      status: 'running',
      result: null,
      source: cloud.status === 'ready' ? 'gemini' : 'simulated',
      error: null,
      facts: pack.facts,
      links: pack.links,
    };
    const key = targetKey(target);
    putTurn(key, turn);
    try {
      if (cloud.status === 'ready') {
        const result = await assistRecord(cloud.cloud, input);
        putTurn(key, { ...turn, status: 'done', result, source: result.mock ? 'mock' : 'gemini' });
      } else {
        await pause(450);
        putTurn(key, { ...turn, status: 'done', result: simulateAssist(input) });
      }
    } catch (e: unknown) {
      putTurn(key, { ...turn, status: 'error', error: explainAssistError(e) });
    }
  };

  return (task, question = '') => {
    void run(task, question);
  };
}
