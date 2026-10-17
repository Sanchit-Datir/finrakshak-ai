import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runToolLoop, type LoopTool, type ToolLoopOptions } from './toolLoop.js';
import type { ToolCall, ToolModel, ToolResult } from './toolModel.js';

interface Out {
  readonly response: Record<string, unknown>;
  readonly text?: string;
}

function scripted(steps: ToolCall[][], fail?: Error): { model: ToolModel; seen: ToolResult[][] } {
  const seen: ToolResult[][] = [];
  const model: ToolModel = {
    id: 'scripted',
    start: () => {
      let i = 0;
      return {
        step: (results) => {
          seen.push([...results]);
          if (fail) return Promise.reject(fail);
          return Promise.resolve(steps[i++] ?? []);
        },
        usage: () => ({ inputTokens: 7, outputTokens: 3 }),
      };
    },
  };
  return { model, seen };
}

const call = (name: string, args: unknown = {}): ToolCall => ({ id: name, name, args });

/** `look` replies with exactly 10 characters of JSON ({"v":"12"} is 10). */
const look: LoopTool<null, Out> = {
  spec: { name: 'look', description: 'd', parameters: {} },
  run: () => Promise.resolve({ response: { v: '12' } }),
};
const finish: LoopTool<null, Out> = {
  spec: { name: 'finish', description: 'd', parameters: {} },
  run: (args) =>
    Promise.resolve().then(() => {
      const text = z.object({ text: z.string().min(1) }).parse(args).text;
      return { response: { ok: true }, text };
    }),
};

function options(over: Partial<ToolLoopOptions<null, Out>> = {}): {
  opts: ToolLoopOptions<null, Out>;
  kept: string[];
} {
  const kept: string[] = [];
  const opts: ToolLoopOptions<null, Out> = {
    system: 'sys', // 3 characters
    user: 'user!', // 5 characters
    tools: [look, finish],
    ctx: null,
    limits: { maxToolCalls: 5, maxInputChars: 100 },
    finish: ['finish'],
    finishHint: 'finish',
    accept: (out) => {
      if (out.text === 'bad') return 'rejected';
      if (out.text !== undefined) kept.push(out.text);
      return null;
    },
    done: () => kept.length > 0,
    ...over,
  };
  return { opts, kept };
}

describe('runToolLoop', () => {
  it('stops on the finishing tool and reports calls, characters and usage', async () => {
    const { opts, kept } = options();
    const { model } = scripted([[call('look')], [call('finish', { text: 'ok' })]]);
    const out = await runToolLoop(model, opts);
    expect(kept).toEqual(['ok']);
    expect(out).toEqual({
      toolCalls: 2,
      inputChars: 8 + 10 + 11,
      usage: { inputTokens: 7, outputTokens: 3 },
      failure: null,
    });
  });

  it('allows a lookup at exactly the input budget and refuses the next one', async () => {
    // 8 characters to start; the budget is 18, so a lookup at 8 and at 18 runs, at 28 is refused.
    const { opts } = options({ limits: { maxToolCalls: 5, maxInputChars: 18 } });
    const { model, seen } = scripted([
      [call('look')],
      [call('look')],
      [call('look')],
      [call('finish', { text: 'ok' })],
    ]);
    const out = await runToolLoop(model, opts);
    expect(seen.slice(1, 4).map((r) => r[0]?.response)).toEqual([
      { v: '12' },
      { v: '12' },
      { error: 'input budget used up: call finish now' },
    ]);
    expect(out.toolCalls).toBe(4);
  });

  it('reports unknown tools, bad arguments and rejected outputs without keeping them', async () => {
    const { opts, kept } = options();
    const { model, seen } = scripted([
      [call('fetch_url'), call('finish', { text: '' }), call('finish', { text: 'bad' })],
      [call('finish', { text: 'good' })],
    ]);
    await runToolLoop(model, opts);
    expect(seen[1]?.map((r) => Object.keys(r.response))).toEqual([['error'], ['error'], ['error']]);
    expect(seen[1]?.[2]?.response).toEqual({ error: 'rejected' });
    expect(kept).toEqual(['good']);
  });

  it('drops calls past the budget and does not ask the model again', async () => {
    const { opts } = options({ limits: { maxToolCalls: 2, maxInputChars: 100 } });
    const { model, seen } = scripted([[call('look'), call('look'), call('look')]]);
    const out = await runToolLoop(model, opts);
    expect(out.toolCalls).toBe(2);
    expect(seen).toHaveLength(1);
  });

  it('returns a failure instead of throwing when the model is unavailable', async () => {
    const { opts } = options();
    const out = await runToolLoop(scripted([], new Error('quota exceeded')).model, opts);
    expect(out).toMatchObject({ toolCalls: 0, failure: 'quota exceeded' });
  });

  it('stops when the model calls no tool', async () => {
    const { opts } = options();
    const out = await runToolLoop(scripted([[]]).model, opts);
    expect(out).toMatchObject({ toolCalls: 0, failure: null });
  });
});
