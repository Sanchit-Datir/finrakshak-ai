import { Save } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/Button.js';
import { Card } from '../ui/Card.js';
import { SelectField, TextField } from '../ui/Field.js';
import { Notice } from '../ui/States.js';
import { ROLE_LABEL } from '../../domain/labels.js';
import { updateDemoSession, useSession } from '../../state/session.js';
import { mutate, useDb } from '../../state/store.js';
import { useToast } from '../../state/toast.js';

export function ProfileTab(): React.JSX.Element {
  const db = useDb();
  const toast = useToast();
  // A signed-in cloud account is managed by the administrator; only a demo profile is editable here.
  const managed = useSession()?.demo === false;
  const [p, setP] = useState(db.settings.profile);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(p) !== JSON.stringify(db.settings.profile);
  const save = (): void => {
    if (p.name.trim() === '') {
      setErr('Name is required.');
      return;
    }
    if (p.email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) {
      setErr('Enter a valid work email.');
      return;
    }
    setErr(null);
    mutate((d) => {
      d.settings.profile = { ...p, name: p.name.trim() };
    });
    updateDemoSession({ name: p.name.trim(), employeeId: p.employeeId, branchId: p.branchId });
    toast.push({ tone: 'success', title: 'Profile saved' });
  };
  return (
    <Card className="max-w-3xl p-5">
      {managed && (
        <Notice className="mb-3">
          Your name, employee ID, role and branch are managed by your administrator.
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Name"
          required
          readOnly={managed}
          value={p.name}
          error={err !== null && p.name.trim() === '' ? err : null}
          onChange={(e) => {
            setP({ ...p, name: e.target.value });
          }}
        />
        <TextField
          label="Employee ID"
          readOnly={managed}
          value={p.employeeId}
          onChange={(e) => {
            setP({ ...p, employeeId: e.target.value });
          }}
        />
        <TextField
          label="Work email"
          type="email"
          readOnly={managed}
          value={p.email}
          error={err !== null && p.name.trim() !== '' ? err : null}
          onChange={(e) => {
            setP({ ...p, email: e.target.value });
          }}
        />
        <TextField
          label="Role"
          value={ROLE_LABEL[p.role]}
          readOnly
          hint={
            managed
              ? 'Set by your administrator.'
              : "Set by quick sign-in. Real roles would come from your bank's identity system."
          }
        />
        <SelectField
          label="Branch"
          disabled={managed}
          value={p.branchId}
          onChange={(e) => {
            setP({ ...p, branchId: e.target.value });
          }}
        >
          {db.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="primary" icon={Save} disabled={!dirty} onClick={save}>
          Save
        </Button>
        <Button
          disabled={!dirty}
          onClick={() => {
            setP(db.settings.profile);
            setErr(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}
