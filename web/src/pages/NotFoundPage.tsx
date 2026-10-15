import { Compass } from 'lucide-react';
import { LinkButton } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/States.js';
import { useDocumentTitle } from '../state/hooks.js';

export function NotFoundPage(): React.JSX.Element {
  useDocumentTitle('Page not found');
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="Page not found"
        action={
          <LinkButton to="/dashboard" variant="primary">
            Go to dashboard
          </LinkButton>
        }
      >
        The address may be mistyped or the page may have moved.
      </EmptyState>
    </Card>
  );
}
