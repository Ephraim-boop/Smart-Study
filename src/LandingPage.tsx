import type { ReactNode } from 'react';
import { COUNTRIES, formatPrice } from './subscription/config/countries';
import { PREMIUM_ENABLED } from './subscription/config/featureFlags';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  ChartIcon,
  CheckIcon,
  ClockIcon,
  ListIcon,
  LogoIcon,
  SettingsIcon,
  UploadIcon,
} from './components/icons';
import { useAuth } from './auth/AuthProvider';
import { useI18n } from './i18n/LanguageProvider';

const gn = COUNTRIES.GN;
const sl = COUNTRIES.SL;

const ROUTINE_ICONS = [UploadIcon, ChartIcon];
const FEATURE_ICONS = [ListIcon, undefined, undefined];

/**
 * Single card accent, used by every dashboard card. Each value is a set of
 * *literal* Tailwind classes (never built by string concatenation) so the JIT
 * compiler can see them. Part of the bold-vibrant, one-accent identity: a
 * cobalt-blue accent over white cards.
 */
const ACCENT = {
  tile: 'bg-blue-50 text-blue-700',
  cta: 'text-blue-700',
  ring: 'hover:ring-blue-500/40',
};

function IconTile({ children, accent = 'bg-blue-50 text-blue-700' }: { children: ReactNode; accent?: string }) {
  return (
    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`}>
      {children}
    </div>
  );
}

function Navbar({ onStartTour, onReturnWelcome, onOpenSettings }: { onStartTour: () => void; onReturnWelcome: () => void; onOpenSettings: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        <button type="button" onClick={onReturnWelcome} className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-glow">
            <LogoIcon width={18} height={18} />
          </span>
          <span className="font-sans text-lg font-extrabold tracking-tight text-slate-900">StudySmart</span>
        </button>
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          {/* Opens the full-screen tutorial: a new student gets the whole
              explanation, not a note tacked onto a page they don't yet read. */}
          <button
            type="button"
            onClick={onStartTour}
            className="transition hover:text-blue-700"
          >
            {t('nav.howItWorks')}
          </button>
        </nav>
        <div className="flex items-center gap-2.5">
          {user && (
            <span className="hidden max-w-[10rem] truncate text-sm font-medium text-slate-500 sm:block" title={user.email}>
              {user.email}
            </span>
          )}
          {/* Settings lives with the account controls (email / settings). */}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t('nav.settings')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <SettingsIcon width={16} height={16} /> <span className="hidden sm:inline">{t('nav.settings')}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function HeroMock() {
  const { t } = useI18n();
  return (
    <div className="relative">
      <div className="rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <LogoIcon width={16} height={16} />
            </span>
            <span className="text-[1.25rem] font-extrabold tracking-tight text-slate-900">StudySmart</span>
          </div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-semibold text-blue-700">
            {t('hero.dashboardPreview')}
          </span>
        </div>

        <div className="mt-5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
          {t('hero.studyOverview')}
        </div>
        <h3 className="mt-2 font-sans text-[1.35rem] font-extrabold tracking-tight text-slate-900">
          {t('hero.yourStudySpace')}
        </h3>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <BookOpenIcon width={16} height={16} />
            </span>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('hero.currentSubject')}</p>
              <p className="mt-0.5 text-[0.95rem] font-semibold text-slate-900">{t('hero.subjectName')}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
              <div>
                <p className="text-[10px] font-semibold text-slate-900">Key topics</p>
                <p className="text-[9px] text-slate-500">found: 8</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <ClockIcon width={12} height={12} />
              </span>
              <div>
                <p className="text-[10px] font-semibold text-slate-900">Practice quiz</p>
                <p className="text-[9px] text-slate-500">12 questions</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] font-medium text-slate-500">
            <span>{t('hero.weeklyProgress')}</span>
            <span className="font-bold text-blue-700">72%</span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="h-8 rounded-md bg-blue-100" />
          <div className="h-10 rounded-lg bg-cyan-100" />
          <div className="h-10 rounded-lg bg-indigo-100" />
        </div>
      </div>
    </div>
  );
}

function Hero({ onEnterDashboard }: { onEnterDashboard: () => void }) {
  const { t } = useI18n();
  return (
    <section id="top" className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-blue-700 to-cyan-600">
      {/* Decorative accent shapes. Kept behind the content (the grid below
          is `relative`) and `pointer-events-none`, so they add color without ever
          covering text or intercepting a click. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/30 blur-2xl" />
        <div className="absolute -right-24 top-16 h-80 w-80 rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute left-8 top-1/2 h-3 w-3 rounded-full bg-white/50" />
        <div className="absolute bottom-16 right-1/4 h-4 w-4 rounded-full bg-cyan-200/60" />
      </div>
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 md:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white ring-1 ring-inset ring-white/25">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> {t('hero.badge')}
          </span>
          <h1 className="mt-6 font-sans text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
            {t('hero.title')}
          </h1>
          <p className="mt-5 max-w-md text-lg text-white/85">{t('hero.subtitle')}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onEnterDashboard}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-blue-700 shadow-glow transition hover:bg-cyan-50"
            >
              {t('hero.startFree')} <ArrowUpRightIcon width={18} height={18} />
            </button>
          </div>
        </div>
        <HeroMock />
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center,
  light,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
  light?: boolean;
}) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      {eyebrow && <p className={`text-sm font-semibold uppercase tracking-wider ${light ? 'text-cyan-300' : 'text-blue-700'}`}>{eyebrow}</p>}
      <h2 className={`${eyebrow ? 'mt-2 ' : ''}font-sans text-3xl font-extrabold tracking-tight sm:text-4xl ${light ? 'text-white' : 'text-slate-900'}`}>{title}</h2>
      {subtitle && <p className={`mt-3 ${light ? 'text-white/80' : 'text-slate-600'}`}>{subtitle}</p>}
    </div>
  );
}

function Routine({
  onUploadNotes,
  onOpenPractice,
}: {
  onUploadNotes: () => void;
  onOpenPractice: () => void;
}) {
  const { tList } = useI18n();
  const steps = tList('routine.steps');
  const titles = tList('routine.titles');
  const bodies = tList('routine.bodies');
  const ctas = tList('routine.ctas');
  const handlers: (((() => void) | undefined))[] = [onUploadNotes, onOpenPractice];

  return (
    <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
        {steps.map((step, i) => {
          const Icon = ROUTINE_ICONS[i] ?? UploadIcon;
          const onClick = handlers[i];
          const accent = ACCENT;
          const inner = (
            <>
              <IconTile accent={accent.tile}>
                <Icon width={22} height={22} />
              </IconTile>
              <p className={`mt-5 text-xs font-semibold uppercase tracking-wider ${accent.cta}`}>{step}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{titles[i]}</h3>
              <p className="mt-2 text-sm text-slate-600">{bodies[i]}</p>
              {onClick && (
                <span className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${accent.cta}`}>
                  {ctas[i]} <ArrowRightIcon width={16} height={16} />
                </span>
              )}
            </>
          );
          const cardCls = `group rounded-3xl bg-white p-6 text-left shadow-card ring-1 ring-slate-200 transition ${accent.ring}`;
          return onClick ? (
            <button key={step} type="button" onClick={onClick} className={cardCls}>
              {inner}
            </button>
          ) : (
            <div key={step} className={cardCls}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Features({
  onOpenSummaries,
  onOpenFlashcards,
  onOpenAssignmentSolver,
}: {
  onOpenSummaries: () => void;
  onOpenFlashcards: () => void;
  onOpenAssignmentSolver: () => void;
}) {
  const { tList } = useI18n();
  const titles = tList('features.titles');
  const bodies = tList('features.bodies');
  const ctas = tList('features.ctas');
  const handlers: (((() => void) | undefined))[] = [onOpenSummaries, onOpenFlashcards, onOpenAssignmentSolver];

  return (
    <section id="features" className="bg-white/5">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
          {titles.map((title, i) => {
            const Icon = FEATURE_ICONS[i];
            const onClick = handlers[i];
            const cta = ctas[i] ?? '';
            const accent = ACCENT;
            const inner = (
              <>
                {Icon && (
                  <IconTile accent={accent.tile}>
                    <Icon width={22} height={22} />
                  </IconTile>
                )}
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{bodies[i]}</p>
                {onClick && (
                  <span className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${accent.cta}`}>
                    {cta} <ArrowRightIcon width={16} height={16} />
                  </span>
                )}
              </>
            );
            const cardCls = `rounded-3xl bg-white p-6 text-left shadow-card ring-1 ring-slate-200 transition ${accent.ring}`;
            return onClick ? (
              <button key={title} type="button" onClick={onClick} className={cardCls}>
                {inner}
              </button>
            ) : (
              <div key={title} className={cardCls}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const { t, tList } = useI18n();
  const freeBullets = tList('pricing.freeBullets');
  const premiumBullets = tList('pricing.premiumBullets');
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
      <SectionHeading
        eyebrow={t('pricing.eyebrow')}
        title={t('pricing.title')}
        subtitle={t('pricing.subtitle')}
        center
        light
      />
      <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-8 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">{t('pricing.forEveryStudent')}</p>
          <h3 className="mt-3 text-2xl font-semibold text-slate-900">{t('pricing.freeName')}</h3>
          <p className="mt-4 font-sans text-4xl font-extrabold tracking-tight text-slate-900">{t('pricing.freePrice')}</p>
          <p className="mt-3 text-sm text-slate-600">{t('pricing.freeBody')}</p>
          <ul className="mt-6 space-y-3 text-sm text-slate-600">
            {freeBullets.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-blue-600"><CheckIcon width={16} height={16} /></span> {f}
              </li>
            ))}
          </ul>
          <a
            href="#"
            className="mt-8 block rounded-xl border border-blue-200 py-3 text-center font-semibold text-slate-900 transition hover:bg-blue-50"
          >
            {t('pricing.freeCta')}
          </a>
        </div>

        {/* Premium */}
        <div className="relative flex flex-col rounded-3xl border-2 border-blue-600 bg-white p-8 shadow-card">
          <span className="absolute -top-3 left-8 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            {t('pricing.moreRoom')}
          </span>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">{t('pricing.premiumName')}</h3>
          <p className="mt-3 text-lg font-semibold text-slate-900">
            {formatPrice(gn.defaultMonthlyPrice, gn.currency)} {t('pricing.perMonthGuinea')}
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {formatPrice(sl.defaultMonthlyPrice, sl.currency)} {t('pricing.perMonthSierraLeone')}
          </p>
          <p className="mt-3 text-sm text-slate-600">{t('pricing.premiumBody')}</p>
          <ul className="mt-6 space-y-3 text-sm text-slate-600">
            {premiumBullets.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-blue-600"><CheckIcon width={16} height={16} /></span> {f}
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-900">{t('pricing.paymentOption')}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-cyan-200">
              <ClockIcon width={13} height={13} /> {t('pricing.paymentPending')}
            </span>
            <p className="mt-2 text-xs text-slate-600">{t('pricing.paymentNote')}</p>
          </div>

          <a
            href="#"
            className="mt-6 block rounded-xl bg-blue-600 py-3 text-center font-semibold text-white transition hover:bg-blue-700"
          >
            {t('pricing.premiumCta')}
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * Placeholder shown while Premium subscriptions are temporarily disabled (see
 * subscription/config/featureFlags.ts). It keeps the `#pricing` anchor alive so
 * the nav links still land somewhere, but shows no prices, payment details or
 * purchase buttons — just a clear "coming soon" notice.
 */
function ComingSoon() {
  const { t } = useI18n();
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-b from-indigo-50 via-white to-cyan-50 p-8 text-center shadow-card sm:p-12">
        <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-200">
          {t('pricing.comingSoon.label')}
        </span>
        <h2 className="mt-6 font-sans text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
          <span className="bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">
            {t('pricing.comingSoon.title')}
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-slate-600">
          {t('pricing.comingSoon.body')}
        </p>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
              <LogoIcon width={16} height={16} />
            </span>
            <span className="font-sans text-lg font-extrabold tracking-tight text-white">StudySmart</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">{t('footer.tagline')}</p>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage({
  stage,
  onUploadNotes,
  onOpenSummaries,
  onOpenPractice,
  onOpenFlashcards,
  onOpenAssignmentSolver,
  onStartTour,
  onEnterDashboard,
  onReturnWelcome,
  onOpenSettings,
}: {
  stage: 'welcome' | 'dashboard';
  onUploadNotes: () => void;
  onOpenSummaries: () => void;
  onOpenPractice: () => void;
  onOpenFlashcards: () => void;
  onOpenAssignmentSolver: () => void;
  onStartTour: () => void;
  onEnterDashboard: () => void;
  onReturnWelcome: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-white font-sans text-slate-700">
      <Navbar onStartTour={onStartTour} onReturnWelcome={onReturnWelcome} onOpenSettings={onOpenSettings} />
      <main>
        {stage === 'welcome' ? (
          <Hero onEnterDashboard={onEnterDashboard} />
        ) : (
          <div className="relative overflow-hidden bg-gradient-to-b from-indigo-700 via-blue-700 to-slate-950">
            {/* Same blue identity as the Welcome hero. Decorative shapes sit
                behind the content and never intercept clicks. */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute -right-24 top-10 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="absolute -left-20 top-40 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            </div>
            {/* Dashboard title, placed above the cards. */}
            <div className="relative mx-auto max-w-6xl px-4 pt-16 sm:px-6">
              <SectionHeading title={t('features.title')} light />
            </div>
            {/* Back to the Welcome page is handled by the logo in the navbar. */}
            <div className="relative">
              <Routine onUploadNotes={onUploadNotes} onOpenPractice={onOpenPractice} />
              <Features
                onOpenSummaries={onOpenSummaries}
                onOpenFlashcards={onOpenFlashcards}
                onOpenAssignmentSolver={onOpenAssignmentSolver}
              />
              {PREMIUM_ENABLED ? <Pricing /> : <ComingSoon />}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
