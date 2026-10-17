import { describe, expect, it, vi } from 'vitest';
import { MockToolModel } from './mockModel.js';
import type { ToolCall } from './toolModel.js';

const CALLS: readonly ToolCall[] = [
  { id: 'c1', name: 'submit_review', args: { summary: 'All sources were checked today.' } },
];

describe('MockToolModel', () => {
  it('has no model id (nothing billed is recorded on reviews)', () => {
    expect(new MockToolModel(() => CALLS).id).toBeNull();
  });

  it('replays the script once per session, then returns no calls', async () => {
    const session = new MockToolModel(() => CALLS).start();
    expect(await session.step([])).toEqual(CALLS);
    expect(
      await session.step([{ id: 'c1', name: 'submit_review', response: { ok: true } }]),
    ).toEqual([]);
    expect(await session.step([])).toEqual([]);
  });

  it('runs the script lazily on the first step, afresh for each session', async () => {
    const script = vi.fn(() => CALLS);
    const model = new MockToolModel(script);
    const first = model.start();
    expect(script).not.toHaveBeenCalled();
    await first.step([]);
    await model.start().step([]);
    expect(script).toHaveBeenCalledTimes(2);
  });

  it('returns a copy, so callers cannot change the script', async () => {
    const script: ToolCall[] = [...CALLS];
    const calls = await new MockToolModel(() => script).start().step([]);
    calls.pop();
    expect(script).toHaveLength(1);
  });

  it('reports zero token usage', async () => {
    const session = new MockToolModel(() => CALLS).start();
    await session.step([]);
    expect(session.usage()).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
