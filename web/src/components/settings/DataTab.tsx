import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/Button.js';
import { Card } from '../ui/Card.js';
import { ConfirmDialog } from '../ui/Dialog.js';
import { clearWorkspace, resetToDemo } from '../../state/store.js';
import { useToast } from '../../state/toast.js';

export function DataTab(): React.JSX.Element {
  const toast = useToast();
  const [confirm, setConfirm] = useState<'reset' | 'clear' | null>(null);
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-2 font-semibold">Workspace data</h3>
        <p className="text-muted mb-3 text-sm">
          Resetting restores the original sample records; clearing removes every record.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={RotateCcw}
            onClick={() => {
              setConfirm('reset');
            }}
          >
            Reset sample records
          </Button>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={() => {
              setConfirm('clear');
            }}
          >
            Clear workspace
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm !== null}
        danger={confirm === 'clear'}
        title={confirm === 'reset' ? 'Reset sample records?' : 'Clear all records?'}
        confirmLabel={confirm === 'reset' ? 'Reset' : 'Clear workspace'}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          if (confirm === 'reset') resetToDemo();
          else clearWorkspace();
          toast.push({
            tone: 'success',
            title: confirm === 'reset' ? 'Sample records restored' : 'Workspace cleared',
          });
          setConfirm(null);
        }}
      >
        <p>
          {confirm === 'reset'
            ? 'All changes you made (applications, reviews, notes, alert and case updates) will be replaced by the original sample records.'
            : 'All applications, documents, loans, alerts and cases will be removed from this browser. Your profile and preferences are kept.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}
