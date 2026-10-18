import { RISK_BAND_LABELS, RISK_BANDS } from '@finrakshak-ai/shared';
import { Download } from 'lucide-react';
import { Button } from '../ui/Button.js';
import { Card } from '../ui/Card.js';
import { Checkbox, FilterSelect } from '../ui/Field.js';
import { SearchInput } from '../ui/SearchInput.js';
import { hasRiskFilters, type RiskFilters } from '../../lib/risk-score-view.js';

/** Filters above the risk score table; the page keeps them in the URL. */
export function RiskFilterBar({
  filters,
  onChange,
  onClear,
  onExport,
  canExport,
}: {
  filters: RiskFilters;
  onChange: (next: RiskFilters) => void;
  onClear: () => void;
  onExport: () => void;
  canExport: boolean;
}): React.JSX.Element {
  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
        <SearchInput
          label="Search"
          value={filters.query}
          onChange={(query) => {
            onChange({ ...filters, query });
          }}
          placeholder="Loan or borrower ID…"
        />
        <FilterSelect
          label="Band"
          value={filters.band}
          onChange={(band) => {
            const next = RISK_BANDS.find((b) => b === band);
            onChange({ ...filters, band: next ?? 'all' });
          }}
          options={[
            { value: 'all', label: 'All bands' },
            ...[...RISK_BANDS].reverse().map((b) => ({ value: b, label: RISK_BAND_LABELS[b] })),
          ]}
        />
        <Button icon={Download} onClick={onExport} disabled={!canExport}>
          Export CSV
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Checkbox
          label="Changed since the last run"
          checked={filters.changedOnly}
          onChange={(e) => {
            onChange({ ...filters, changedOnly: e.target.checked });
          }}
        />
        <Checkbox
          label="Stale public data only"
          checked={filters.staleOnly}
          onChange={(e) => {
            onChange({ ...filters, staleOnly: e.target.checked });
          }}
        />
        {hasRiskFilters(filters) && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </Card>
  );
}
