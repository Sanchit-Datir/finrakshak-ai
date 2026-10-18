/** Client-side exports. Sensitive identifiers must already be masked by callers. */

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function cell(v: string | number | null): string {
  const s = v === null ? '' : String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function exportHeader(title: string, scope: string): string {
  return [
    title,
    `Generated: ${new Date().toISOString()}`,
    `Scope: ${scope}`,
    'Sample records. Sensitive identifiers are masked.',
    'Findings and alerts are investigative leads, not fraud determinations.',
    '',
  ].join('\n');
}
