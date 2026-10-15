import {
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleSlash,
  CircleX,
  Clock3,
  FilePen,
  FileWarning,
  Hourglass,
  LoaderCircle,
  Pencil,
  Search,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  ALERT_STATUS_LABEL,
  APP_STATUS_LABEL,
  CASE_STATUS_LABEL,
  EVIDENCE_STATUS_LABEL,
  FIELD_STATE_LABEL,
  FINDING_STATUS_LABEL,
  LINK_STATUS_LABEL,
  PRIORITY_HELP,
  PRIORITY_LABEL,
  PROCESSING_LABEL,
} from '../../domain/labels.js';
import type {
  AlertStatus,
  ApplicationStatus,
  CaseStatus,
  Evidence,
  FieldState,
  FindingStatus,
  LinkStatus,
  Priority,
  ProcessingState,
} from '../../domain/schemas.js';
import { Badge, type Tone } from './Badge.js';

type Spec = [Tone, LucideIcon];

const PRIORITY: Record<Priority, Spec> = {
  routine: ['ok', CircleCheck],
  needs_attention: ['warn', TriangleAlert],
  urgent: ['danger', ShieldAlert],
};
export function PriorityBadge({ priority }: { priority: Priority | null }): React.JSX.Element {
  if (priority === null)
    return (
      <Badge tone="neutral" icon={CircleDashed} title="Checks have not been run">
        Not checked
      </Badge>
    );
  const [tone, icon] = PRIORITY[priority];
  return (
    <Badge tone={tone} icon={icon} title={PRIORITY_HELP[priority]}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

const APP: Record<ApplicationStatus, Spec> = {
  draft: ['neutral', FilePen],
  documents_needed: ['warn', FileWarning],
  processing: ['info', LoaderCircle],
  needs_review: ['warn', Search],
  ready_for_decision: ['info', Hourglass],
  approved: ['ok', BadgeCheck],
  declined: ['neutral', CircleX],
};
export function AppStatusBadge({ status }: { status: ApplicationStatus }): React.JSX.Element {
  const [tone, icon] = APP[status];
  return (
    <Badge tone={tone} icon={icon}>
      {APP_STATUS_LABEL[status]}
    </Badge>
  );
}

const ALERT: Record<AlertStatus, Spec> = {
  new: ['info', CircleDashed],
  in_review: ['warn', Search],
  escalated: ['danger', ShieldAlert],
  resolved: ['ok', CircleCheck],
  false_positive: ['neutral', CircleSlash],
};
export function AlertStatusBadge({ status }: { status: AlertStatus }): React.JSX.Element {
  const [tone, icon] = ALERT[status];
  return (
    <Badge tone={tone} icon={icon}>
      {ALERT_STATUS_LABEL[status]}
    </Badge>
  );
}

const CASE: Record<CaseStatus, Spec> = {
  new: ['info', CircleDashed],
  triage: ['info', Clock3],
  in_review: ['warn', Search],
  information_requested: ['violet', Hourglass],
  escalated: ['danger', ShieldAlert],
  resolved: ['ok', CircleCheck],
  closed: ['neutral', CircleSlash],
};
export function CaseStatusBadge({ status }: { status: CaseStatus }): React.JSX.Element {
  const [tone, icon] = CASE[status];
  return (
    <Badge tone={tone} icon={icon}>
      {CASE_STATUS_LABEL[status]}
    </Badge>
  );
}

const FINDING: Record<FindingStatus, Spec> = {
  needs_review: ['warn', CircleDashed],
  in_review: ['info', Search],
  resolved: ['ok', CircleCheck],
  not_an_issue: ['neutral', CircleSlash],
};
export function FindingStatusBadge({ status }: { status: FindingStatus }): React.JSX.Element {
  const [tone, icon] = FINDING[status];
  return (
    <Badge tone={tone} icon={icon}>
      {FINDING_STATUS_LABEL[status]}
    </Badge>
  );
}

const FIELD: Record<FieldState, Spec> = {
  unreviewed: ['neutral', CircleDashed],
  confirmed: ['ok', CircleCheck],
  corrected: ['info', Pencil],
  unclear: ['warn', CircleHelp],
};
export function FieldStateBadge({ state }: { state: FieldState }): React.JSX.Element {
  const [tone, icon] = FIELD[state];
  return (
    <Badge tone={tone} icon={icon}>
      {FIELD_STATE_LABEL[state]}
    </Badge>
  );
}

const PROC: Record<ProcessingState, Spec> = {
  queued: ['neutral', Clock3],
  uploading: ['info', LoaderCircle],
  processing: ['info', LoaderCircle],
  needs_review: ['warn', Search],
  completed: ['ok', CircleCheck],
  failed: ['danger', CircleX],
};
export function ProcessingBadge({ state }: { state: ProcessingState }): React.JSX.Element {
  const [tone, icon] = PROC[state];
  return (
    <Badge tone={tone} icon={icon}>
      {PROCESSING_LABEL[state]}
    </Badge>
  );
}

const EVIDENCE: Record<Evidence['status'], Spec> = {
  verified_source: ['ok', BadgeCheck],
  user_provided: ['info', Pencil],
  unverified: ['warn', CircleHelp],
  contradicted: ['danger', CircleX],
};
export function EvidenceStatusBadge({ status }: { status: Evidence['status'] }): React.JSX.Element {
  const [tone, icon] = EVIDENCE[status];
  return (
    <Badge tone={tone} icon={icon}>
      {EVIDENCE_STATUS_LABEL[status]}
    </Badge>
  );
}

const LINK: Record<LinkStatus, Spec> = {
  verified: ['ok', BadgeCheck],
  user_provided: ['info', Pencil],
  inferred: ['warn', CircleHelp],
};
export function LinkStatusBadge({ status }: { status: LinkStatus }): React.JSX.Element {
  const [tone, icon] = LINK[status];
  return (
    <Badge tone={tone} icon={icon}>
      {LINK_STATUS_LABEL[status]}
    </Badge>
  );
}
