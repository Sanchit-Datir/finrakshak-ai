import { ArrowLeft, ArrowRight, FileQuestion, Save } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CaptureStep } from '../components/applications/CaptureStep.js';
import { ExtractStep } from '../components/applications/ExtractStep.js';
import { ReviewStep } from '../components/applications/ReviewStep.js';
import { RiskStep } from '../components/applications/RiskStep.js';
import { STEPS, Stepper } from '../components/applications/Stepper.js';
import { Button, LinkButton } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { DemoBadge, EmptyState, Notice } from '../components/ui/States.js';
import { AppStatusBadge } from '../components/ui/StatusBadges.js';
import {
  createDraftApplication,
  saveApplication,
  setStep,
  submitApplication,
} from '../state/actions.js';
import { useActor } from '../state/hooks.js';
import { useSession } from '../state/session.js';
import { getDb, useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';

export function NewApplicationPage(): React.JSX.Element {
  const { applicationId } = useParams();
  const db = useDb();
  const actor = useActor();
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const app =
    applicationId === undefined
      ? null
      : (db.applications.find((a) => a.id === applicationId) ?? null);
  const [localStep, setLocalStep] = useState<number | null>(null);

  if (applicationId !== undefined && app === null) {
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="Application not found"
          action={<LinkButton to="/applications">Back to applications</LinkButton>}
        >
          {applicationId} does not exist in this workspace. It may have been created in a different
          browser.
        </EmptyState>
      </Card>
    );
  }

  const step = localStep ?? app?.step ?? 1;
  const furthest = Math.max(step, app?.step ?? 1);
  const docs =
    app === null ? [] : app.documentIds.flatMap((id) => db.documents.filter((d) => d.id === id));

  /** Creates the draft on first meaningful action, then moves to its edit URL. */
  const ensureApp = (): string => {
    if (app !== null) return app.id;
    const id = createDraftApplication(
      actor,
      session?.branchId ?? db.branches[0]?.id ?? 'br-shirur',
    );
    void navigate(`/applications/${id}/edit`, { replace: true });
    return id;
  };

  const go = (n: number): void => {
    const id = ensureApp();
    const current = getDb().applications.find((a) => a.id === id);
    if (current !== undefined && n > current.step) setStep(id, n);
    setLocalStep(n);
    window.scrollTo({ top: 0 });
  };

  const saveDraft = (): void => {
    const id = ensureApp();
    saveApplication(id, actor, {});
    toast.push({
      tone: 'success',
      title: 'Draft saved',
      detail: `${id} — uploaded documents and reviewed fields are kept.`,
    });
  };

  const pending = docs.reduce(
    (n, d) => n + d.fields.filter((f) => f.state === 'unreviewed').length,
    0,
  );

  return (
    <>
      <PageHeader
        docTitle={app === null ? 'New application' : `${app.id} · ${STEPS[step - 1] ?? ''}`}
        title={app === null ? 'New loan application' : `Application ${app.id}`}
        badge={
          <>
            {app !== null && <AppStatusBadge status={app.status} />}
            <DemoBadge />
          </>
        }
        subtitle="Capture paper documents, verify what was read, review the application, then run checks."
      />
      <Stepper current={step} furthest={furthest} onSelect={go} />
      {app !== null && (app.status === 'approved' || app.status === 'declined') && (
        <Notice tone="warn" className="mb-4">
          This application already has a recorded decision (demo state). Changes here are recorded
          in the audit history but do not change the decision.
        </Notice>
      )}

      {step === 1 && (
        <>
          <CaptureStep app={app} docs={docs} actor={actor} ensureApp={ensureApp} />
          <StepNav
            onSave={saveDraft}
            onNext={() => {
              go(2);
            }}
            nextLabel="Continue to extract & verify"
          />
        </>
      )}
      {step === 2 && app !== null && (
        <>
          <ExtractStep docs={docs} actor={actor} />
          {pending > 0 && (
            <Notice tone="warn" className="mt-4">
              {pending} field(s) still unreviewed. You can continue, but unreviewed values are not
              used to fill the application and will be reported by the checks.
            </Notice>
          )}
          <StepNav
            onBack={() => {
              go(1);
            }}
            onSave={saveDraft}
            onNext={() => {
              go(3);
            }}
            nextLabel="Continue to review application"
          />
        </>
      )}
      {step === 3 && app !== null && (
        <ReviewStep
          key={app.id}
          app={app}
          docs={docs}
          db={db}
          actor={actor}
          onBack={() => {
            go(2);
          }}
          onContinue={() => {
            go(4);
          }}
          onAttach={() => {
            go(1);
          }}
        />
      )}
      {step === 4 && app !== null && (
        <RiskStep
          app={app}
          db={db}
          actor={actor}
          onBack={() => {
            go(3);
          }}
          onSubmit={() => {
            submitApplication(app.id, actor);
            toast.push({
              tone: 'success',
              title: `${app.id} submitted for review`,
              detail: 'Status set to “Needs review”. No decision has been made.',
              action: {
                label: 'Open application',
                onClick: () => {
                  void navigate(`/applications/${app.id}`);
                },
              },
            });
            void navigate(`/applications/${app.id}`);
          }}
        />
      )}
      {step > 1 && app === null && (
        <Card>
          <EmptyState
            icon={FileQuestion}
            title="Start by capturing documents"
            action={
              <Button
                onClick={() => {
                  setLocalStep(1);
                }}
              >
                Go to step 1
              </Button>
            }
          >
            Add at least one document or save a draft first.
          </EmptyState>
        </Card>
      )}
    </>
  );
}

function StepNav({
  onBack,
  onSave,
  onNext,
  nextLabel,
}: {
  onBack?: () => void;
  onSave: () => void;
  onNext: () => void;
  nextLabel: string;
}): React.JSX.Element {
  return (
    <div className="border-line bg-surface/95 sticky bottom-0 z-20 -mx-4 mt-6 flex gap-2 border-t px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      {onBack !== undefined && (
        <Button icon={ArrowLeft} onClick={onBack}>
          Previous
        </Button>
      )}
      <Button icon={Save} onClick={onSave} className="ml-auto">
        Save draft
      </Button>
      <Button variant="primary" onClick={onNext}>
        <span className="hidden sm:inline">{nextLabel}</span>
        <span className="sm:hidden">Next</span>
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
