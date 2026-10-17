import { describe, expect, it } from 'vitest';
import { findingsSortValue } from './borrower-sort.js';

describe('findingsSortValue', () => {
  it('puts more open findings first, then urgent to no priority', () => {
    const rows = [
      { id: 'none-2', openFindings: 2, priority: null },
      { id: 'routine-2', openFindings: 2, priority: 'routine' as const },
      { id: 'urgent-1', openFindings: 1, priority: 'urgent' as const },
      { id: 'urgent-2', openFindings: 2, priority: 'urgent' as const },
      { id: 'attention-2', openFindings: 2, priority: 'needs_attention' as const },
      { id: 'zero', openFindings: 0, priority: null },
    ];
    const order = [...rows]
      .sort((a, b) => findingsSortValue(b) - findingsSortValue(a))
      .map((r) => r.id);
    expect(order).toEqual(['urgent-2', 'attention-2', 'routine-2', 'none-2', 'urgent-1', 'zero']);
  });
});
