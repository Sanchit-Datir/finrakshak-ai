type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, string | number | boolean | null | undefined>;

/** Cloud Logging reads `severity` and `message` from JSON lines (Cloud Run jobs log stderr). */
const SEVERITY: Readonly<Record<Level, string>> = { info: 'INFO', warn: 'WARNING', error: 'ERROR' };

/** Structured JSON-line logger on stderr. Never log document contents or secrets. */
function write(level: Level, msg: string, fields: Fields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    severity: SEVERITY[level],
    level,
    msg,
    message: msg,
    ...fields,
  });
  process.stderr.write(`${line}\n`);
}

export const log = {
  info: (msg: string, fields: Fields = {}): void => {
    write('info', msg, fields);
  },
  warn: (msg: string, fields: Fields = {}): void => {
    write('warn', msg, fields);
  },
  error: (msg: string, fields: Fields = {}): void => {
    write('error', msg, fields);
  },
};

export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    const cause = e.cause instanceof Error ? ` (cause: ${e.cause.message})` : '';
    return `${e.message}${cause}`;
  }
  return String(e);
}
