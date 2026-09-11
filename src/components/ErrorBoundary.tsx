// A screen that throws should not take the site down with it. The flock, the
// perch, the numbers and the contracts are all still readable when one panel
// has a bug in it.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Note } from './Primitives';

type Props = { children: ReactNode; where: string };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In a real deployment this is where the report goes. It is our bug, and
    // the person reading the screen should not have to describe it back to us.
    console.error(`[${this.props.where}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="box box--bad" role="alert">
          <Note tone="bad">
            <strong className="strong">Something on this screen broke.</strong>
          </Note>
          <p className="small" style={{ marginTop: 8 }}>
            That is our fault, not yours, and nothing on chain was touched — your birds, your
            AVIANS and anything brooding are exactly where they were. The rest of the site still
            works.
          </p>
          <div className="row" style={{ gap: 12, marginTop: 16 }}>
            <button type="button" className="btn btn--small" onClick={() => this.setState({ error: null })}>
              <Icon name="refresh" size={14} color="var(--ink)" /> Try this screen again
            </button>
            <a className="btn btn--ghost btn--small" href="#/">Go to the front page</a>
          </div>
          <p className="mono tiny dim" style={{ marginTop: 16, overflowWrap: 'anywhere' }}>
            {this.props.where}: {this.state.error.message}
          </p>
        </div>
      </div>
    );
  }
}
