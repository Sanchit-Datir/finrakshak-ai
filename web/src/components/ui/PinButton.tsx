import { Star } from 'lucide-react';
import { isPinned, togglePin, usePins, type Pin } from '../../state/pins.js';
import { buttonClass } from './Button.js';
import { cn } from './cn.js';

/** Star toggle that keeps this record in the sidebar's "Pinned" list. */
export function PinButton({ pin }: { pin: Pin }): React.JSX.Element {
  const on = isPinned(usePins(), pin.href);
  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? 'Remove from the sidebar' : 'Keep this in the sidebar for quick access'}
      onClick={() => {
        togglePin(pin);
      }}
      className={buttonClass('secondary')}
    >
      <Star
        className={cn('size-4 transition-transform', on && 'text-warn scale-110 fill-current')}
        aria-hidden
      />
      {on ? 'Pinned' : 'Pin'}
    </button>
  );
}
