import { ChartColumnIncreasing, Search, ShieldAlert } from 'lucide-react';
import { NetworkIllustration } from './NetworkIllustration.js';

const VALUE_PROPS = [
  {
    icon: Search,
    title: 'Uncover hidden connections',
    text: 'Link borrowers, companies, directors and related entities from public records.',
  },
  {
    icon: ShieldAlert,
    title: 'Identify potential risk',
    text: 'Detect adverse records, legal cases, regulatory findings and unusual patterns.',
  },
  {
    icon: ChartColumnIncreasing,
    title: 'Monitor throughout the loan lifecycle',
    text: 'Track new public-record developments after disbursement.',
  },
];

function ShieldLogo(): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 72" aria-hidden className="h-16 w-14 shrink-0">
      <path
        d="M32 3 6 13v20c0 17 11 29 26 36 15-7 26-19 26-36V13Z"
        fill="#0b253b"
        stroke="#5eead4"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <rect x="20" y="38" width="5" height="12" rx="1" fill="#fff" />
      <rect x="29.5" y="32" width="5" height="18" rx="1" fill="#fff" />
      <rect x="39" y="26" width="5" height="24" rx="1" fill="#fff" />
      <path
        d="m18 32 9-8 6 5 12-11"
        fill="none"
        stroke="#5eead4"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Brand block reused by the desktop panel and the mobile header. */
export function LoginBrand(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <ShieldLogo />
      <div className="leading-tight">
        <p className="text-2xl font-bold tracking-tight text-white">
          FinRakshak <span className="text-teal-300">AI</span>
        </p>
        <p className="text-sm text-white/80">Loan Lifecycle Intelligence</p>
      </div>
    </div>
  );
}

/** Left-hand marketing panel of the sign-in page (desktop only). */
export function LoginHero(): React.JSX.Element {
  return (
    <div className="relative hidden w-[60%] overflow-hidden bg-[radial-gradient(ellipse_at_70%_40%,#0f4c5c_0%,#0b253b_55%,#071a2b_100%)] lg:block">
      <div className="relative flex h-full gap-6 p-12 text-white">
        <div className="flex max-w-md flex-col">
          <LoginBrand />
          <h1 className="mt-14 text-5xl leading-[1.1] font-bold tracking-tight">
            See Beyond the Balance Sheet<span className="text-teal-300">.</span>
          </h1>
          <p className="mt-5 text-xl text-white/80">
            Public-record intelligence for smarter, safer lending decisions.
          </p>
          <ul className="mt-12 space-y-7">
            {VALUE_PROPS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-5">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-teal-400/10 ring-1 ring-teal-300/40">
                  <Icon className="size-8 text-teal-300" aria-hidden />
                </span>
                <span>
                  <span className="block text-lg font-semibold">{title}</span>
                  <span className="mt-1 block text-sm text-white/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden flex-1 items-center justify-center xl:flex">
          <NetworkIllustration />
        </div>
      </div>
    </div>
  );
}
