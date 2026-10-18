import { Checkbox } from '../../ui/Field.js';
import { cn } from '../../ui/cn.js';

/** One section of the review form, with the "Mark information unverified" switch. */
export function ReviewSection({
  title,
  unverified,
  onToggle,
  children,
}: {
  title: string;
  unverified: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <fieldset className={cn('card p-4 sm:p-5', unverified && 'border-warn')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <legend className="text-[16px] font-semibold">{title}</legend>
        <Checkbox label="Mark information unverified" checked={unverified} onChange={onToggle} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
