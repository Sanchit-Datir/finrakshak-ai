import { PageHeader } from '../components/ui/PageHeader.js';
import { Tabs } from '../components/ui/Tabs.js';
import { useUrlState } from '../state/url.js';
import { ProfileTab } from '../components/settings/ProfileTab.js';
import { PreferencesTab } from '../components/settings/PreferencesTab.js';
import { RiskTab } from '../components/settings/RiskTab.js';
import { ChecklistTab } from '../components/settings/ChecklistTab.js';
import { DataTab } from '../components/settings/DataTab.js';

type Tab = 'profile' | 'preferences' | 'risk' | 'checklists' | 'data';

export function SettingsPage(): React.JSX.Element {
  const [tab, setTab] = useUrlState('tab', 'profile');
  const tabs = [
    { key: 'profile' as const, label: 'Profile' },
    { key: 'preferences' as const, label: 'Preferences' },
    { key: 'risk' as const, label: 'Risk & monitoring rules' },
    { key: 'checklists' as const, label: 'Document checklists' },
    { key: 'data' as const, label: 'Workspace data' },
  ];
  const current = (tabs.some((t) => t.key === tab) ? tab : 'profile') as Tab;
  return (
    <>
      <PageHeader
        docTitle="Settings"
        title="Settings"
        subtitle="Your profile, preferences, and (for authorised roles) risk configuration."
      />
      <Tabs
        label="Settings sections"
        tabs={tabs}
        value={current}
        onChange={(k) => {
          setTab(k);
        }}
      >
        {current === 'profile' && <ProfileTab />}
        {current === 'preferences' && <PreferencesTab />}
        {current === 'risk' && <RiskTab />}
        {current === 'checklists' && <ChecklistTab />}
        {current === 'data' && <DataTab />}
      </Tabs>
    </>
  );
}
