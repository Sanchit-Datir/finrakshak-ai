import { ASK_GEMINI_MAX_PROMPT_CHARS, type AskGeminiResult } from '@fund-tracker/shared';
import { Cloud, LogIn, LogOut, Sparkles } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import {
  cloudConfig,
  connectCloud,
  type Cloud as CloudConnection,
} from '../../lib/cloud/firebase.js';
import { explainCloudError } from '../../lib/cloud/errors.js';
import { askGemini } from '../../lib/cloud/gemini.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Card, CardHeader } from '../ui/Card.js';
import { TextArea, TextField } from '../ui/Field.js';
import { Notice } from '../ui/States.js';

// Read once: the build environment cannot change while the page is open.
const CONFIG = cloudConfig();

type Link =
  | { state: 'connecting' }
  | { state: 'failed' }
  | { state: 'ready'; cloud: CloudConnection; user: CloudUser | null };

interface CloudUser {
  /** What to show as the signed-in name. */
  label: string;
  /** Firebase user ID. The owner adds this to the AI allow-list; unlike an email it cannot be chosen. */
  uid: string;
}

export function CloudAiTab(): React.JSX.Element {
  if (CONFIG === null) return <NotConnected />;
  return <ConnectedPanel />;
}

function NotConnected(): React.JSX.Element {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Cloud className="size-5" aria-hidden /> Cloud and AI
          </span>
        }
        actions={<Badge tone="neutral">Not connected</Badge>}
      />
      <p className="text-sm">
        This build has no Firebase settings, so the app runs on demo data only and makes no AI
        calls. To connect it, set <code>VITE_FIREBASE_API_KEY</code>,{' '}
        <code>VITE_FIREBASE_AUTH_DOMAIN</code>, <code>VITE_FIREBASE_PROJECT_ID</code> and{' '}
        <code>VITE_FIREBASE_APP_ID</code> (see <code>docs/DEPLOY.md</code>).
      </p>
    </Card>
  );
}

function ConnectedPanel(): React.JSX.Element {
  const [link, setLink] = useState<Link>({ state: 'connecting' });

  useEffect(() => {
    if (CONFIG === null) return undefined;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    connectCloud(CONFIG)
      .then(async (cloud) => {
        const { onAuthStateChanged } = await import('firebase/auth');
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(cloud.auth, (user) => {
          setLink({
            state: 'ready',
            cloud,
            user: user === null ? null : { label: user.email ?? user.uid, uid: user.uid },
          });
        });
      })
      .catch(() => {
        if (!cancelled) setLink({ state: 'failed' });
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Cloud className="size-5" aria-hidden /> Cloud and AI
            </span>
          }
          actions={
            <Badge tone={link.state === 'ready' && link.user !== null ? 'ok' : 'neutral'}>
              {link.state === 'ready' && link.user !== null ? 'Signed in' : 'Not signed in'}
            </Badge>
          }
        />
        {link.state === 'connecting' && <p className="text-sm">Connecting…</p>}
        {link.state === 'failed' && (
          <Notice tone="danger" title="Could not start the cloud connection">
            Reload the page and try again.
          </Notice>
        )}
        {link.state === 'ready' && link.user === null && <SignInForm cloud={link.cloud} />}
        {link.state === 'ready' && link.user !== null && (
          <SignedIn cloud={link.cloud} user={link.user} />
        )}
      </Card>
      {link.state === 'ready' && link.user !== null && <AskPanel cloud={link.cloud} />}
    </div>
  );
}

function SignInForm({ cloud }: { cloud: CloudConnection }): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      await signInWithEmailAndPassword(cloud.auth, email.trim(), password);
    } catch (e) {
      setError(explainCloudError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        void submit(e);
      }}
    >
      <p className="text-sm">
        Sign in with your cloud account to use the AI features. This is separate from the demo
        sign-in used for the rest of the app.
      </p>
      <TextField
        label="Email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
        }}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
        error={error}
      />
      <Button type="submit" variant="primary" icon={LogIn} loading={busy}>
        Sign in
      </Button>
    </form>
  );
}

function SignedIn({ cloud, user }: { cloud: CloudConnection; user: CloudUser }): React.JSX.Element {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Signed in as <strong>{user.label}</strong>.
      </p>
      <p className="text-sm">
        Account ID: <code className="select-all break-all">{user.uid}</code>
        <span className="block text-xs">
          AI features are limited to enabled accounts. If you see “not enabled”, send this ID to an
          administrator.
        </span>
      </p>
      {!cloud.appCheckActive && (
        <Notice tone="warn" title="App Check is not set up">
          Set <code>VITE_RECAPTCHA_SITE_KEY</code>. Until then the live backend will refuse AI
          requests from this site.
        </Notice>
      )}
      <Button
        variant="secondary"
        icon={LogOut}
        onClick={() => {
          void import('firebase/auth').then(({ signOut }) => signOut(cloud.auth));
        }}
      >
        Sign out
      </Button>
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
