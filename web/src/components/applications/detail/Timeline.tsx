import { Card } from '../../ui/Card.js';
import type { Application } from '../../../domain/schemas.js';
import { useFormat } from '../../../state/hooks.js';

export function Timeline({ app }: { app: Application }): React.JSX.Element {
  const f = useFormat();
  const items = [
    ...app.notes.map((n) => ({ id: n.id, at: n.at, who: n.author, what: n.text, note: true })),
    ...app.audit.map((a) => ({
      id: a.id,
      at: a.at,
      who: a.actor,
      what: `${a.action}: ${a.detail}`,
      note: false,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card className="p-5">
      <ol className="border-line space-y-4 border-l pl-5">
        {items.map((i) => (
          <li key={i.id} className="relative">
            <span
              aria-hidden
              className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ${i.note ? 'bg-primary' : 'bg-line'}`}
            />
            <p className="text-sm">
              {i.note && <span className="text-primary mr-1 text-xs font-semibold">NOTE</span>}
              {i.what}
            </p>
            <p className="text-muted text-xs">
              {i.who} · {f.dateTime(i.at)}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
