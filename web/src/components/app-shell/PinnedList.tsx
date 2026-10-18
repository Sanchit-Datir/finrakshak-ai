import {
  Activity,
  BriefcaseBusiness,
  FileStack,
  Star,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { unpin, usePins, type Pin } from '../../state/pins.js';
import { cn } from '../ui/cn.js';

const KIND_ICON: Record<Pin['kind'], LucideIcon> = {
  application: FileStack,
  borrower: UserRound,
  loan: Activity,
  case: BriefcaseBusiness,
};

/** Records the person starred on their pages; hidden until something is pinned. */
export function PinnedList({
  onNavigate,
}: {
  onNavigate: (() => void) | undefined;
}): React.JSX.Element | null {
  const pins = usePins();
  const { pathname, search } = useLocation();
  if (pins.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-rail-muted mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
        <Star className="size-3" aria-hidden /> Pinned
      </p>
      <ul className="space-y-0.5">
        {pins.map((p) => {
          const Icon = KIND_ICON[p.kind];
          const active = `${pathname}${search}` === p.href;
          return (
            <li key={p.href} className="group/pin relative">
              <Link
                to={p.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg py-1.5 pr-8 pl-2.5 text-[13px]',
                  active
                    ? 'bg-white/[0.09] text-white'
                    : 'text-rail-muted hover:bg-white/[0.05] hover:text-white',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{p.title}</span>
              </Link>
              <button
                type="button"
                aria-label={`Unpin ${p.title}`}
                onClick={() => {
                  unpin(p.href);
                }}
                className="text-rail-muted absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-md opacity-0 group-hover/pin:opacity-100 hover:bg-white/10 hover:text-white focus-visible:opacity-100"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
