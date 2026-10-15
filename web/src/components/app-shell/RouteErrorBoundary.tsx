import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '../ui/States.js';

interface State {
  failed: boolean;
}

/** Catches render errors so one broken view never blanks the whole app. No stack traces are shown. */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Log technical detail for developers only; never render it to users.
    console.error('View failed to render', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="card">
          <ErrorState
            title="This page couldn't be displayed"
            onRetry={() => {
              this.setState({ failed: false });
            }}
          >
            Something went wrong while showing this view. Your saved data is unchanged. Try again,
            or go back to the dashboard.
          </ErrorState>
        </div>
      );
    }
    return this.props.children;
  }
}
