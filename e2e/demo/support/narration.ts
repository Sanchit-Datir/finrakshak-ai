import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Voice-over timing. With DEMO_NARRATION_FILE (JSON: spoken line → seconds of audio), each new line
 * waits until the previous one has been spoken, so captions never outrun the voice. With
 * DEMO_TIMELINE_FILE, every spoken line is appended as `{"t": epoch ms, "text": …}`, so the audio
 * clips can be placed on the screen recording afterwards. Without either, nothing changes.
 */
export interface Narrator {
  /** Waits for the line before, then starts this one (empty text: nothing). */
  speak: (text: string) => Promise<void>;
  /** Waits until the current line has been spoken. */
  done: () => Promise<void>;
}

const DurationsSchema = z.record(z.string(), z.number().nonnegative());
/** Breath between two lines. */
const GAP_MS = 350;

function readDurations(file: string): Readonly<Record<string, number>> {
  if (file === '' || !existsSync(file)) return {};
  try {
    return DurationsSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch (e: unknown) {
    throw new Error(`DEMO_NARRATION_FILE is not a valid {line: seconds} JSON file: ${file}`, {
      cause: e,
    });
  }
}

export function createNarrator(
  durationsFile: string,
  timelineFile: string,
  wait: (ms: number) => Promise<void>,
): Narrator {
  const durations = readDurations(durationsFile);
  let endsAt = 0;
  const done = async (): Promise<void> => {
    const left = endsAt - Date.now();
    if (left > 0) await wait(left);
  };
  return {
    done,
    speak: async (text) => {
      if (text === '') return;
      await done();
      const now = Date.now();
      if (timelineFile !== '')
        appendFileSync(timelineFile, `${JSON.stringify({ t: now, text })}\n`);
      const seconds = durations[text];
      endsAt = seconds === undefined ? now : now + seconds * 1000 + GAP_MS;
    },
  };
}
