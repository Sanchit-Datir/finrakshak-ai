import { Card } from '../ui/Card.js';
import { Checkbox, SelectField } from '../ui/Field.js';
import { SettingsSchema } from '../../domain/schemas.js';
import type { Settings } from '../../domain/schemas.js';
import { mutate, useDb } from '../../state/store.js';
import { useToast } from '../../state/toast.js';

export function PreferencesTab(): React.JSX.Element {
  const db = useDb();
  const toast = useToast();
  const prefs = db.settings.preferences;
  const set = (patch: Partial<Settings['preferences']>): void => {
    mutate((d) => {
      d.settings.preferences = SettingsSchema.shape.preferences.parse({
        ...d.settings.preferences,
        ...patch,
      });
    });
    toast.push({ tone: 'success', title: 'Preference saved' });
  };
  return (
    <Card className="max-w-3xl p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Theme"
          value={prefs.theme}
          onChange={(e) => {
            set({ theme: SettingsSchema.shape.preferences.shape.theme.parse(e.target.value) });
          }}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </SelectField>
        <SelectField
          label="Date format"
          value={prefs.dateFormat}
          onChange={(e) => {
            set({
              dateFormat: SettingsSchema.shape.preferences.shape.dateFormat.parse(e.target.value),
            });
          }}
        >
          <option value="dd-mmm-yyyy">15 Oct 2026</option>
          <option value="dd/mm/yyyy">15/10/2026</option>
          <option value="yyyy-mm-dd">2026-10-15</option>
        </SelectField>
        <SelectField
          label="Time zone"
          value={prefs.timezone}
          onChange={(e) => {
            set({ timezone: e.target.value });
          }}
        >
          <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
          <option value="UTC">UTC</option>
        </SelectField>
        <SelectField
          label="Table density"
          value={prefs.density}
          onChange={(e) => {
            set({ density: e.target.value === 'compact' ? 'compact' : 'comfortable' });
          }}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </SelectField>
      </div>
      <fieldset className="mt-5 space-y-2">
        <legend className="mb-1 text-sm font-semibold">Notifications</legend>
        <Checkbox
          label="New alerts in my branch"
          checked={prefs.notifyNewAlerts}
          onChange={(e) => {
            set({ notifyNewAlerts: e.target.checked });
          }}
        />
        <Checkbox
          label="Updates to cases I own"
          checked={prefs.notifyCaseUpdates}
          onChange={(e) => {
            set({ notifyCaseUpdates: e.target.checked });
          }}
        />
        <Checkbox
          label="Weekly digest email"
          checked={prefs.notifyWeeklyDigest}
          onChange={(e) => {
            set({ notifyWeeklyDigest: e.target.checked });
          }}
        />
        <p className="text-muted text-xs">
          Preferences are saved; email/SMS delivery is not connected. In-app alerts appear in the
          notification bell.
        </p>
      </fieldset>
      <fieldset className="mt-5">
        <legend className="mb-1 text-sm font-semibold">Advanced</legend>
        <Checkbox
          label="Developer mode"
          hint="Shows the “Raw details” tab in document extraction views."
          checked={prefs.developerMode}
          onChange={(e) => {
            set({ developerMode: e.target.checked });
          }}
        />
      </fieldset>
    </Card>
  );
}
