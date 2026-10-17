import type { GraphLabIndexEntry } from '@fund-tracker/shared';
import { Upload } from 'lucide-react';
import { useId } from 'react';
import { SelectField } from '../ui/Field.js';

/** Choose a published bundle (data/graph/index.json) or open a bundle file from disk. */
export function BundleSource({
  entries,
  current,
  onChoose,
  onFile,
  disabled,
}: {
  entries: readonly GraphLabIndexEntry[];
  current: string | null;
  onChoose: (file: string) => void;
  onFile: (file: File) => void;
  disabled: boolean;
}): React.JSX.Element {
  const fileId = useId();
  return (
    <div className="flex flex-wrap items-end gap-3">
      {entries.length > 0 && (
        <SelectField
          label="Dataset"
          value={current ?? ''}
          disabled={disabled}
          onChange={(e) => {
            onChoose(e.target.value);
          }}
          className="w-full sm:w-96"
        >
          {entries.map((e) => (
            <option key={e.file} value={e.file}>
              {e.synthetic ? `SYNTHETIC — ${e.label}` : e.label}
            </option>
          ))}
        </SelectField>
      )}
      <div>
        <label
          htmlFor={fileId}
          className="border-line hover:bg-surface-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium has-[:focus-visible]:ring-2"
        >
          <Upload className="size-4" aria-hidden />
          Open bundle file…
          <input
            id={fileId}
            type="file"
            accept=".json,.gz,application/json,application/gzip"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f !== undefined) onFile(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
