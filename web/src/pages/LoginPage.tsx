import { Eye, EyeOff, FileSearch, FlaskConical, Network, ScanLine } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Wordmark } from '../components/app-shell/Logo.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Checkbox, SelectField, TextField, inputClass } from '../components/ui/Field.js';
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

type Lang = 'en' | 'mr';

const T = {
  en: {
    welcome: 'Welcome back',
    sub: 'Sign in to your FundTrace AI workspace.',
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
      'Secure sign-in is not connected in this prototype, so no credentials were checked. Use demo sign-in below to explore with synthetic data.',
  },
  mr: {
    welcome: 'पुन्हा स्वागत आहे',
    sub: 'तुमच्या FundTrace AI कार्यक्षेत्रात साइन इन करा.',
    id: 'कर्मचारी आयडी किंवा कार्यालयीन ईमेल',
    password: 'पासवर्ड',
    remember: 'या उपकरणावर लक्षात ठेवा',
    forgot: 'पासवर्ड विसरलात?',
    signIn: 'साइन इन',
    footer: 'अधिकृत बँक कर्मचाऱ्यांसाठी सुरक्षित प्रवेश.',
    idRequired: 'कर्मचारी आयडी किंवा ईमेल भरा.',
    pwRequired: 'पासवर्ड भरा.',
    emailRequired:
      'तुमचा कार्यालयीन ईमेल पत्ता प्रविष्ट करा. कर्मचारी आयडीने साइन इन अद्याप उपलब्ध नाही.',
    checking: 'तुमचे साइन इन तपासत आहे…',
    notConnected:
      'या प्रोटोटाइपमध्ये सुरक्षित साइन-इन जोडलेले नाही; कोणतीही माहिती तपासली गेली नाही. खालील डेमो साइन-इन वापरा.',
  },
} as const;

function Landscape(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 800 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6c879" />
          <stop offset="0.55" stopColor="#e9a65a" />
          <stop offset="1" stopColor="#7a8f5a" />
        </linearGradient>
      </defs>
      <rect width="800" height="900" fill="url(#sky)" />
      <circle cx="560" cy="300" r="70" fill="#fde7b0" opacity="0.9" />
      <path d="M0 470 Q120 400 240 440 T480 420 T800 430 V900 H0Z" fill="#6b7f4a" />
      <path d="M0 520 Q160 470 330 510 T650 500 T800 505 V900 H0Z" fill="#55703c" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <path
          key={i}
          d={`M${-100 + i * 110} 900 Q${220 + i * 40} 640 ${400 + i * 22} 560`}
          stroke="#8fae5a"
          strokeWidth="14"
          fill="none"
          opacity="0.55"
        />
      ))}
      <path d="M0 640 Q200 600 420 640 T800 630 V900 H0Z" fill="#3f5a2d" opacity="0.7" />
      <g fill="#2f4421">
        <rect x="120" y="470" width="6" height="40" />
        <circle cx="123" cy="460" r="26" />
        <rect x="660" y="455" width="6" height="45" />
        <circle cx="663" cy="445" r="30" />
      </g>
    </svg>
  );
}

const VALUE_PROPS = [
  {
    icon: FileSearch,
    title: 'Detect inconsistencies',
    text: 'Cross-check application details against supporting documents.',
  },
  {
    icon: ScanLine,
    title: 'Review documents faster',
    text: 'Capture Marathi and English paper records and verify fields side by side.',
  },
  {
    icon: Network,
    title: 'Investigate fund movement',
    text: 'Follow post-disbursement transactions and related entities.',
  },
];

export function LoginPage(): React.JSX.Element {
  useDocumentTitle('Sign in');
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [lang, setLang] = useState<Lang>('en');
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
  const t = T[lang];
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
      <div className="relative hidden w-[58%] overflow-hidden lg:block">
        <Landscape />
        <div className="from-navy-deep/90 via-navy/80 to-navy-deep/70 absolute inset-0 bg-gradient-to-br" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Wordmark inverted />
          <div className="max-w-lg">
            <h1 className="text-4xl leading-tight font-bold tracking-tight">
              Safer Loans. Stronger Communities.
            </h1>
            <p className="mt-3 text-lg text-white/85">
              AI-assisted risk intelligence for pre- and post-disbursement lending.
            </p>
            <ul className="mt-10 space-y-5">
              {VALUE_PROPS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/20">
                    <Icon className="size-5 text-teal-200" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-sm text-white/75">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/60">
            Findings are prompts for human review. The product does not guarantee accuracy or detect
            all misuse.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="bg-navy px-5 py-5 text-white lg:hidden">
          <Wordmark inverted />
          <p className="mt-3 text-lg font-semibold">Safer Loans. Stronger Communities.</p>
        </div>
        <div className="ml-auto w-36 px-5 pt-4 box-content">
          <label className="sr-only" htmlFor="login-lang">
            Language
          </label>
          <select
            id="login-lang"
            value={lang}
            onChange={(e) => {
              setLang(e.target.value === 'mr' ? 'mr' : 'en');
            }}
            className={`${inputClass} h-9 py-1`}
          >
            <option value="en">English</option>
            <option value="mr">मराठी</option>
          </select>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-8">
          <div className="card w-full max-w-[420px] p-6 sm:p-8" lang={lang}>
            <h2 className="text-2xl font-semibold tracking-tight">{t.welcome}</h2>
            <p className="text-muted mt-1 text-sm">{t.sub}</p>
            <form noValidate onSubmit={onSubmit} className="mt-6 space-y-4">
              <TextField
                label={t.id}
                name="username"
                autoComplete="username"
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                }}
                error={errors.id ?? null}
                required
              />
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
              {cloudAuth.status === 'loading' && <p className="text-muted text-sm">{t.checking}</p>}
              {cloudAuth.status === 'needs-setup' && (
                <Notice tone="warn" title="Your account is not set up yet">
                  You are signed in, but an administrator has not set up your profile. Send them
                  this Account ID: <code className="select-all break-all">{cloudAuth.uid}</code>
                </Notice>
              )}
              {cloudAuth.status === 'error' && <Notice tone="danger">{cloudAuth.message}</Notice>}
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
                  <FlaskConical className="text-violet size-4" aria-hidden /> Demo sign-in
                </p>
                <p className="text-muted mt-1 text-xs">
                  Explore the prototype with synthetic data. No password is checked and this is not
                  access control.
                </p>
                <SelectField
                  label="Demo role"
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
                  Continue with demo sign-in
                </Button>
              </div>
            )}
            <p className="text-muted mt-6 text-center text-xs">{t.footer}</p>
          </div>
        </div>
      </div>

      <Dialog
        open={forgot}
        onClose={() => {
          setForgot(false);
        }}
        title="Password reset (demo placeholder)"
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
