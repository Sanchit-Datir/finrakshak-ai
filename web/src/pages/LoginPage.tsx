import { Eye, EyeOff, FlaskConical, UserRound } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { LoginBrand, LoginHero } from '../components/login/LoginHero.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Checkbox, SelectField, inputClass } from '../components/ui/Field.js';
import { Notice } from '../components/ui/States.js';
import { ROLE_LABEL } from '../domain/labels.js';
import { RoleSchema, type Role } from '../domain/schemas.js';
import { DEMO_USERS } from '../demo/seed.js';
import { demoEnabled } from '../lib/cloud/config.js';
import { explainCloudError } from '../lib/cloud/errors.js';
import { safeInternalPath } from '../lib/safe-url.js';
import { useDocumentTitle } from '../state/hooks.js';
import { signInWithPassword, signOutCloud, useCloudAuth } from '../state/cloud-auth.js';
import { startDemoSession, useSession } from '../state/session.js';
import { mutate } from '../state/store.js';

/** Sign-in copy (English only). */
const t = {
  welcome: 'Welcome back',
  sub: 'Sign in to your FinRakshak AI workspace.',
  id: 'Employee ID or work email',
  password: 'Password',
  remember: 'Remember me on this device',
  forgot: 'Forgot password?',
  signIn: 'Sign in',
  footer: 'Secure access for authorized banking staff.',
  idRequired: 'Enter your employee ID or work email.',
  pwRequired: 'Enter your password.',
  emailRequired: 'Enter your work email address. Employee ID sign-in is not available yet.',
  checking: 'Checking your sign-in…',
  notConnected:
    'Secure sign-in is not connected in this prototype, so no credentials were checked. Use quick sign-in below to explore with synthetic data.',
} as const;

export function LoginPage(): React.JSX.Element {
  useDocumentTitle('Sign in');
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ id?: string; pw?: string }>({});
  const [notice, setNotice] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [role, setRole] = useState<Role>('branch_manager');
  const cloudAuth = useCloudAuth();
  const cloudMode = cloudAuth.status !== 'off';
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const from = (location.state as { from?: unknown } | null)?.from;
  const target = safeInternalPath(from);

  if (session !== null) return <Navigate to={target} replace />;

  const onSubmit = (e: SyntheticEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const next = {
      ...(userId.trim() === ''
        ? { id: t.idRequired }
        : cloudMode && !userId.includes('@')
          ? { id: t.emailRequired }
          : {}),
      ...(password === '' ? { pw: t.pwRequired } : {}),
    };
    setErrors(next);
    setFormError(null);
    if (!cloudMode) {
      // Plain demo build: there is no sign-in service, so say so (and check nothing).
      setNotice(Object.keys(next).length === 0);
      setPassword('');
      return;
    }
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    signInWithPassword(userId, password, remember)
      .catch((error: unknown) => {
        setFormError(explainCloudError(error));
      })
      .finally(() => {
        setPassword('');
        setBusy(false);
      });
  };

  const demoSignIn = (): void => {
    const u = DEMO_USERS[role];
    startDemoSession({
      name: u.name,
      employeeId: u.employeeId,
      role,
      branchId: u.branchId,
      remember,
    });
    mutate((d) => {
      d.settings.profile = {
        name: u.name,
        employeeId: u.employeeId,
        email: u.email,
        role,
        branchId: u.branchId,
      };
    });
    void navigate(target, { replace: true });
  };

  return (
    <div className="bg-canvas flex min-h-dvh">
      <LoginHero />

      <div className="flex flex-1 flex-col">
        <div className="bg-navy-deep px-5 py-5 lg:hidden">
          <LoginBrand />
          <p className="mt-3 text-lg font-semibold text-white">See Beyond the Balance Sheet.</p>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-8">
          <div className="w-full max-w-[460px]">
            <div className="card p-6 sm:p-8">
              <h2 className="text-2xl font-semibold tracking-tight">{t.welcome}</h2>
              <p className="text-muted mt-1 text-sm">{t.sub}</p>
              <form noValidate onSubmit={onSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="login-id" className="mb-1 block text-[13px] font-medium">
                    {t.id}
                    <span className="text-danger" aria-hidden>
                      {' '}
                      *
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      id="login-id"
                      name="username"
                      autoComplete="username"
                      value={userId}
                      onChange={(e) => {
                        setUserId(e.target.value);
                      }}
                      aria-invalid={errors.id !== undefined}
                      aria-describedby={errors.id === undefined ? undefined : 'login-id-err'}
                      required
                      className={`${inputClass} pr-10`}
                    />
                    <UserRound
                      className="text-muted pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
                      aria-hidden
                    />
                  </div>
                  {errors.id !== undefined && (
                    <p id="login-id-err" className="text-danger mt-1 text-xs font-medium">
                      {errors.id}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="login-password" className="mb-1 block text-[13px] font-medium">
                    {t.password}
                    <span className="text-danger" aria-hidden>
                      {' '}
                      *
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={show ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                      }}
                      aria-invalid={errors.pw !== undefined}
                      aria-describedby={errors.pw === undefined ? undefined : 'login-password-err'}
                      required
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShow((s) => !s);
                      }}
                      aria-label={show ? 'Hide password' : 'Show password'}
                      aria-pressed={show}
                      className="text-muted hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
                    >
                      {show ? (
                        <EyeOff className="size-4" aria-hidden />
                      ) : (
                        <Eye className="size-4" aria-hidden />
                      )}
                    </button>
                  </div>
                  {errors.pw !== undefined && (
                    <p id="login-password-err" className="text-danger mt-1 text-xs font-medium">
                      {errors.pw}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Checkbox
                    label={t.remember}
                    checked={remember}
                    onChange={(e) => {
                      setRemember(e.target.checked);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setForgot(true);
                    }}
                    className="text-primary shrink-0 text-sm font-medium hover:underline"
                  >
                    {t.forgot}
                  </button>
                </div>
                {!cloudMode && notice && <Notice tone="warn">{t.notConnected}</Notice>}
                {formError !== null && <Notice tone="danger">{formError}</Notice>}
                {cloudAuth.status === 'loading' && (
                  <p className="text-muted text-sm">{t.checking}</p>
                )}
                {cloudAuth.status === 'needs-setup' && (
                  <Notice tone="warn" title="Your account is not set up yet">
                    You are signed in, but an administrator has not set up your profile. Send them
                    this Account ID: <code className="select-all break-all">{cloudAuth.uid}</code>
                  </Notice>
                )}
                {cloudAuth.status === 'error' && (
                  <Notice tone="danger">
                    {cloudAuth.message}
                    <span className="mt-1 block text-xs">
                      Reference: <code className="break-all select-all">{cloudAuth.reference}</code>
                    </span>
                  </Notice>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={busy}
                  disabled={cloudAuth.status === 'loading'}
                >
                  {t.signIn}
                </Button>
                {(cloudAuth.status === 'needs-setup' || cloudAuth.status === 'error') && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      void signOutCloud();
                    }}
                  >
                    Sign out of this account
                  </Button>
                )}
              </form>

              {demoEnabled(import.meta.env) && (
                <div className="border-line mt-6 rounded-xl border border-dashed p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <FlaskConical className="text-violet size-4" aria-hidden /> Quick sign-in
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    Explore the prototype with synthetic data. No password is checked and this is
                    not access control.
                  </p>
                  <SelectField
                    label="Sign-in role"
                    className="mt-3"
                    value={role}
                    onChange={(e) => {
                      setRole(RoleSchema.parse(e.target.value));
                    }}
                  >
                    {RoleSchema.options.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]} — {DEMO_USERS[r].name}
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    variant="subtle"
                    className="mt-3 w-full"
                    icon={FlaskConical}
                    onClick={demoSignIn}
                  >
                    Continue with quick sign-in
                  </Button>
                </div>
              )}
            </div>
            <p className="text-muted mt-6 text-center text-xs">{t.footer}</p>
          </div>
        </div>
      </div>

      <Dialog
        open={forgot}
        onClose={() => {
          setForgot(false);
        }}
        title="Password reset (placeholder)"
        footer={
          <Button
            variant="primary"
            onClick={() => {
              setForgot(false);
            }}
          >
            OK
          </Button>
        }
      >
        <p className="text-sm">
          Password reset is not available in this prototype. In production it would be handled by
          your bank&apos;s identity provider; contact your branch administrator.
        </p>
      </Dialog>
    </div>
  );
}
