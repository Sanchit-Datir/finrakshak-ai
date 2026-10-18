import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { Button } from '../../ui/Button.js';

/** Sticky footer on mobile, inline on desktop. */
export function ReviewActions({
  onBack,
  onSaveDraft,
  onContinue,
}: {
  onBack?: (() => void) | undefined;
  onSaveDraft: () => void;
  onContinue: () => void;
}): React.JSX.Element {
  return (
    <div className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
      {onBack !== undefined && (
        <Button icon={ArrowLeft} onClick={onBack}>
          Previous step
        </Button>
      )}
      <Button icon={Save} onClick={onSaveDraft} className="ml-auto">
        Save draft
      </Button>
      <Button variant="primary" onClick={onContinue}>
        Continue to risk analysis <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
