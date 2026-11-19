import { useEffect, useRef, useState } from 'react';
import { LandingPage } from './LandingPage';
import { UploadNotesPage } from './upload/UploadNotesPage';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { AuthPage } from './auth/AuthPage';
import { LanguageProvider, useI18n } from './i18n/LanguageProvider';
import { LanguageGate } from './i18n/LanguageGate';
import { NotesProvider } from './summarize/NotesProvider';
import { SavedSummariesProvider } from './summarize/SavedSummariesProvider';
import { SmartSummarizePage } from './summarize/components/SmartSummarizePage';
import { SavedSummariesPage } from './summarize/components/SavedSummariesPage';
import { PracticeProvider } from './practice/PracticeProvider';
import { PracticePage } from './practice/components/PracticePage';
import { FlashcardsProvider } from './flashcards/FlashcardsProvider';
import { FlashcardsPage } from './flashcards/components/FlashcardsPage';
import { SettingsPage } from './settings/SettingsPage';
import { TourScreen } from './tour/TourScreen';
import { useStudyTour } from './tour/useStudyTour';
import { AssignmentSolverPage } from './assignment/AssignmentSolverPage';

type View = 'landing' | 'upload' | 'summarize' | 'saved' | 'practice' | 'flashcards' | 'settings' | 'assignmentSolver';

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500" />
    </div>
  );
}

/**
 * The StudySmart app, gated behind real authentication. When Supabase is not
 * configured, or the user is signed out / has not confirmed their email / is
 * mid password-reset, only the auth screen is shown (features stay hidden).
 * The full app renders only for a signed-in, email-confirmed user.
 */
function Root() {
  const { user, loading, passwordRecovery } = useAuth();
  const { hasPreference } = useI18n();
  const [view, setView] = useState<View>('landing');
  // Where the Upload page should return to when the student is done.
  const [uploadReturn, setUploadReturn] = useState<View>('landing');
  // The landing experience has two stages: the Welcome page (the hero, shown
  // first right after login) and the Features Dashboard (opened by its buttons).
  // Kept here so it survives a trip into a study tool and back.
  const [landingStage, setLandingStage] = useState<'welcome' | 'dashboard'>('welcome');
  const openUpload = (from: View) => {
    setUploadReturn(from);
    setView('upload');
  };
  // The "How it works" tutorial takes over the screen while it is open, so it
  // only needs the app's navigation for the hand-over at the end.
  const tour = useStudyTour(setView);
  const appShellRef = useRef<HTMLDivElement>(null);

  // While the tutorial is up, the app behind it must stop answering screen
  // readers and Tab, otherwise a student hears (and can focus) a page they were
  // never meant to be looking at any more.
  useEffect(() => {
    const shell = appShellRef.current;
    if (!shell) return;
    if (tour.active) {
      shell.setAttribute('aria-hidden', 'true');
      shell.setAttribute('inert', '');
    } else {
      shell.removeAttribute('aria-hidden');
      shell.removeAttribute('inert');
    }
  }, [tour.active]);

  // Every successful sign-in starts fresh on the Welcome page. Root is NOT
  // unmounted when a student logs out and back in, so without this the app would
  // reopen on whatever dashboard or tool they last left (and on a shared device
  // the previous account's view could linger). Keyed on the user id, it fires on
  // login, on switching account, and on a hard refresh while already signed in.
  useEffect(() => {
    if (user?.id) {
      setView('landing');
      setLandingStage('welcome');
    }
  }, [user?.id]);

  // First-time visitors pick a language before touching auth. The choice is
  // saved to localStorage, so this screen shows only once per browser.
  if (!hasPreference) return <LanguageGate />;
  if (loading) return <Splash />;
  // A recovery session exists but the password hasn't been reset yet — show the
  // reset form instead of the app.
  if (passwordRecovery) return <AuthPage />;
  if (!user || !user.emailConfirmed) return <AuthPage />;

  return (
    <>
      <div ref={appShellRef} className="min-h-screen bg-gradient-to-br from-indigo-700 via-blue-700 to-cyan-600">
        {view === 'upload' ? (
          <UploadNotesPage
            onBack={() => setView(uploadReturn)}
            onSummarize={() => setView('summarize')}
          />
        ) : view === 'summarize' ? (
          <SmartSummarizePage
            onBack={() => setView('upload')}
            onUploadNotes={() => setView('upload')}
            onOpenSaved={() => setView('saved')}
          />
        ) : view === 'saved' ? (
          <SavedSummariesPage onBack={() => setView('landing')} />
        ) : view === 'practice' ? (
          <PracticePage
            onBack={() => setView('landing')}
            onUploadNotes={() => setView('upload')}
            onReviewTopics={() => setView('saved')}
          />
        ) : view === 'flashcards' ? (
          <FlashcardsPage
            onBack={() => setView('landing')}
            onUploadNotes={() => setView('upload')}
          />
        ) : view === 'assignmentSolver' ? (
          <AssignmentSolverPage onBack={() => setView('landing')} />
        ) : view === 'settings' ? (
          <SettingsPage onBack={() => setView('landing')} />
        ) : (
          <LandingPage
            stage={landingStage}
            onUploadNotes={() => openUpload('landing')}
            onOpenSummaries={() => setView('saved')}
            onOpenPractice={() => setView('practice')}
            onOpenFlashcards={() => setView('flashcards')}
            onOpenAssignmentSolver={() => setView('assignmentSolver')}
            onStartTour={tour.start}
            onEnterDashboard={() => setLandingStage('dashboard')}
            onReturnWelcome={() => setLandingStage('welcome')}
            onOpenSettings={() => setView('settings')}
          />
        )}
      </div>
      {/* Full-screen tutorial — replaces the app until it is finished or skipped. */}
      {tour.active && <TourScreen tour={tour} />}
    </>
  );
}

export function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <NotesProvider>
            <SavedSummariesProvider>
              <PracticeProvider>
                <FlashcardsProvider>
                  <Root />
                </FlashcardsProvider>
              </PracticeProvider>
            </SavedSummariesProvider>
          </NotesProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
