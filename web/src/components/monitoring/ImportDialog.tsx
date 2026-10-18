import { Download, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Notice } from '../ui/States.js';
import { CSV_TEMPLATE, importCsv } from '../../lib/csv-import.js';
import type { ImportResult } from '../../lib/csv-import.js';
import { downloadFile } from '../../lib/export.js';
import { importTransactions } from '../../state/actions.js';
import { useDb } from '../../state/store.js';
import { useToast } from '../../state/toast.js';

export function ImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const db = useDb();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<(ImportResult & { filename: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = (): void => {
    setResult(null);
    setError(null);
    onClose();
  };
  const read = async (file: File): Promise<void> => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError('File is larger than 5 MB. Split it and import in parts.');
      return;
    }
    try {
      setResult({ ...importCsv(await file.text(), db), filename: file.name });
    } catch {
      setError('The file could not be read. Check it is a UTF-8 CSV file.');
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title="Import transaction file"
      description="CSV extract of authorised transaction records. Parsed and validated in your browser."
      footer={
        <>
          <Button
            onClick={() => {
              downloadFile('transactions-template.csv', CSV_TEMPLATE, 'text/csv');
            }}
            icon={Download}
          >
            Download template
          </Button>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={result === null || result.rows.length === 0}
            onClick={() => {
              if (result === null) return;
              const n = importTransactions(result.rows, result.newEntities, result.filename);
              toast.push({
                tone: 'success',
                title: `${n} transaction(s) imported`,
                detail: 'Monitoring rules re-evaluated automatically.',
              });
              close();
            }}
          >
            Import {result?.rows.length ?? 0} valid row(s)
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          Required columns:{' '}
          <code className="text-xs">
            transaction_id, loan_id, datetime, from_account, to_account, amount_inr, type, reference
          </code>
          . Accounts may be existing IDs (e.g. <code className="text-xs">a-dnyaneshwar</code>) or
          counterparty names — unknown names are added as unverified counterparties.
        </p>
        <Notice tone="warn">
          Only import records you are authorised to use. Use synthetic data in this prototype.
        </Notice>
        <Button icon={FileUp} onClick={() => ref.current?.click()}>
          Choose CSV file
        </Button>
        <input
          ref={ref}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f !== undefined) void read(f);
          }}
        />
        {error !== null && <Notice tone="danger">{error}</Notice>}
        {result !== null && (
          <div role="status" className="space-y-2">
            <p>
              <strong>{result.filename}</strong>: {result.rows.length} valid, {result.errors.length}{' '}
              with errors, {result.duplicates} duplicate(s) skipped, {result.newEntities.length} new
              counterparty(ies).
            </p>
            {result.errors.length > 0 && (
              <ul className="bg-danger-soft max-h-40 overflow-y-auto rounded-lg p-2 text-xs">
                {result.errors.map((er) => (
                  <li key={er.line}>
                    Line {er.line}: {er.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
