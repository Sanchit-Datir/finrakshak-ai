import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { Button } from '../ui/Button.js';

export function StepNav({
  onBack,
  onSave,
  onNext,
  nextDisabled = false,
  nextLabel,
}: {
  onBack?: () => void;
  onSave: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
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
      <Button variant="primary" onClick={onNext} disabled={nextDisabled}>
        <span className="hidden sm:inline">{nextLabel}</span>
        <span className="sm:hidden">Next</span>
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
