import { ASK_GEMINI_MAX_PROMPT_CHARS, type AskGeminiResult } from '@fund-tracker/shared';
import { Cloud, Sparkles } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { explainCloudError } from '../../lib/cloud/errors.js';
import type { Cloud as CloudConnection } from '../../lib/cloud/firebase.js';
import { askGemini } from '../../lib/cloud/gemini.js';
import { useCloudAuth } from '../../state/cloud-auth.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Card, CardHeader } from '../ui/Card.js';
import { TextArea } from '../ui/Field.js';
import { Notice } from '../ui/States.js';

function Heading(): React.JSX.Element {
  return (
    <span className="flex items-center gap-2">
      <Cloud className="size-5" aria-hidden /> Cloud and AI
    </span>
  );
}

/**
 * Uses the app's main sign-in. A demo session never reaches the cloud: the AI features exist only
 * for a real account whose administrator has switched AI on for it.
 */
export function CloudAiTab(): React.JSX.Element {
  const auth = useCloudAuth();

  if (auth.status === 'off') {
    return (
      <Card>
        <CardHeader title={<Heading />} actions={<Badge tone="neutral">Not connected</Badge>} />
        <p className="text-sm">
          This build has no Firebase settings, so the app runs on demo data only and makes no AI
          calls. To connect it, set <code>VITE_FIREBASE_API_KEY</code>,{' '}
          <code>VITE_FIREBASE_AUTH_DOMAIN</code>, <code>VITE_FIREBASE_PROJECT_ID</code> and{' '}
          <code>VITE_FIREBASE_APP_ID</code> (see <code>docs/DEPLOY.md</code>).
        </p>
      </Card>
    );
  }

  if (auth.status !== 'ready') {
    return (
      <Card>
        <CardHeader title={<Heading />} actions={<Badge tone="warn">Demo mode</Badge>} />
        <p className="text-sm">
          {auth.status === 'loading'
            ? 'Connecting…'
            : 'AI features are not available in demo mode. Sign out and sign in with your work account to use them.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={<Heading />} actions={<Badge tone="ok">Signed in</Badge>} />
        <div className="space-y-3">
          <p className="text-sm">
            Signed in as <strong>{auth.profile.name}</strong>
            {auth.email === null ? '' : ` (${auth.email})`}.
          </p>
          <p className="text-sm">
            Account ID: <code className="select-all break-all">{auth.uid}</code>
            <span className="block text-xs">
              Your administrator uses this ID to manage your access.
            </span>
          </p>
          {!auth.cloud.appCheckActive && (
            <Notice tone="warn" title="App Check is not set up">
              Set <code>VITE_RECAPTCHA_SITE_KEY</code>. Until then the live backend will refuse AI
              requests from this site.
            </Notice>
          )}
        </div>
      </Card>
      {auth.profile.aiEnabled ? (
        <AskPanel cloud={auth.cloud} />
      ) : (
        <Notice tone="info" title="AI is not enabled for your account">
          An administrator has to switch AI on for you. Send them your Account ID (shown above).
        </Notice>
      )}
    </div>
  );
}

function AskPanel({ cloud }: { cloud: CloudConnection }): React.JSX.Element {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskGeminiResult | null>(null);
  const tooLong = prompt.length > ASK_GEMINI_MAX_PROMPT_CHARS;

  async function ask(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await askGemini(cloud, prompt));
    } catch (e) {
      setResult(null);
      setError(explainCloudError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-5" aria-hidden /> Ask Gemini (test)
          </span>
        }
      />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          void ask(e);
        }}
      >
        <TextArea
          label="Question"
          rows={4}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          hint={`${prompt.length} / ${ASK_GEMINI_MAX_PROMPT_CHARS} characters. Do not paste real customer data.`}
          error={tooLong ? 'This question is too long.' : null}
        />
        <Button
          type="submit"
          variant="primary"
          icon={Sparkles}
          loading={busy}
          disabled={prompt.trim() === '' || tooLong}
        >
          Ask
        </Button>
      </form>
      {error !== null && (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      )}
      {result !== null && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            {result.mock ? (
              <Badge tone="warn">Mock reply: no AI model was called</Badge>
            ) : (
              <Badge tone="info">Live AI reply</Badge>
            )}
            {result.remainingToday !== null && (
              <span className="text-xs">{result.remainingToday} left today</span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm">{result.text}</p>
          <p className="text-xs">Machine-generated text. Please verify before relying on it.</p>
        </div>
      )}
    </Card>
  );
}
