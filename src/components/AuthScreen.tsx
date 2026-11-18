import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { Moon, Sun, ArrowRight, AlertCircle, UserCheck } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import type { ThemeMode } from '../types/chat';

interface AuthScreenProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onContinueAsGuest: () => void;
}

function formatAuthError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Authentication failed. Please try again.';
  const e = err as { code?: string; message?: string };
  switch (e.code) {
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in this Firebase project. Enable it in Firebase Console -> Authentication -> Sign-in method, or use Google Sign-In / Continue as Guest.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Switch to Log In instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/popup-closed-by-user':
      return 'Google Sign-In window was closed before completing sign-in.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Google Sign-In popups. You can still use Continue as Guest locally.';
    default:
      return e.message || 'Authentication failed. Please try again.';
  }
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  theme,
  onToggleTheme,
  onContinueAsGuest,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (authMode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 80) });
        }
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FC] dark:bg-[#0E1117] text-[#111827] dark:text-[#F1F5F9]">
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
        <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          Material AI Chat
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="min-h-[40px] px-3 rounded-xl border border-[#E2E8F0] dark:border-[#262E3B] bg-white dark:bg-[#171C24] text-sm font-medium inline-flex items-center gap-2 hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530] transition-colors whitespace-nowrap shrink-0"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        <section className="lg:col-span-6 space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium text-[#0B57D0] dark:text-[#A8C7FA]">
              Material 3 Conversational Workspace
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
              Thoughtful AI chat with cloud sync and offline intelligence.
            </h1>
            <p className="text-base text-[#475569] dark:text-[#94A3B8] max-w-xl leading-relaxed">
              Sign in with Google or Email to sync multi-chat threads and cross-chat memory via
              Cloud Firestore, or start right away in local Guest mode.
            </p>
          </div>

          <div className="border-t border-[#E2E8F0] dark:border-[#262E3B] pt-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Per-User Cloud Sync & Shared Memory</h2>
              <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
                Conversations, custom system instructions, and remembered facts sync privately under
                your user account.
              </p>
            </div>
            <div className="border-t border-[#E2E8F0] dark:border-[#262E3B] pt-4 space-y-1">
              <h2 className="text-sm font-semibold">Built-In Offline Assistant</h2>
              <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
                Run calculations, percentages, AI concept explanations, date/time lookups, and name
                memory locally without a network key.
              </p>
            </div>
            <div className="border-t border-[#E2E8F0] dark:border-[#262E3B] pt-4 space-y-1">
              <h2 className="text-sm font-semibold">Portable JSON Backups</h2>
              <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
                Export, inspect, paste, or restore your full chat history anytime from the Help &
                Backup screen.
              </p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-6">
          <div className="rounded-3xl bg-white dark:bg-[#171C24] border border-[#E2E8F0] dark:border-[#262E3B] p-6 sm:p-8 space-y-6">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-semibold">Sign in or continue as guest</h2>
              <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
                Choose Cloud Sync with Firebase Auth or local Guest Mode.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-red-300 dark:border-red-800/70 bg-red-50 dark:bg-red-950/40 p-3.5 text-sm text-red-800 dark:text-red-200 flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0B57D0] text-white dark:bg-[#A8C7FA] dark:text-[#062E6F] font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <span>Continue with Google</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-[#E2E8F0] dark:border-[#262E3B]" />
              <span className="px-3 text-xs text-[#64748B] dark:text-[#94A3B8]">
                or use email & password
              </span>
              <div className="flex-grow border-t border-[#E2E8F0] dark:border-[#262E3B]" />
            </div>

            <div
              role="tablist"
              aria-label="Email authentication mode"
              className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#EEF2F7] dark:bg-[#1E2530]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'login'}
                onClick={() => {
                  setAuthMode('login');
                  setError(null);
                }}
                className={`min-h-[40px] rounded-lg text-sm font-medium transition-colors ${
                  authMode === 'login'
                    ? 'bg-white dark:bg-[#2A3342] text-[#111827] dark:text-white'
                    : 'text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'signup'}
                onClick={() => {
                  setAuthMode('signup');
                  setError(null);
                }}
                className={`min-h-[40px] rounded-lg text-sm font-medium transition-colors ${
                  authMode === 'signup'
                    ? 'bg-white dark:bg-[#2A3342] text-[#111827] dark:text-white'
                    : 'text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div className="space-y-1.5">
                  <label htmlFor="auth-name" className="block text-sm font-medium">
                    Display Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Rivera"
                    maxLength={80}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0E1117] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] dark:focus-visible:ring-[#A8C7FA]"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="auth-email" className="block text-sm font-medium">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0E1117] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] dark:focus-visible:ring-[#A8C7FA]"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="auth-password" className="block text-sm font-medium">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0E1117] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] dark:focus-visible:ring-[#A8C7FA]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#D3E3FD] text-[#041E49] dark:bg-[#004A77] dark:text-[#C2E7FF] font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading
                  ? 'Please wait...'
                  : authMode === 'signup'
                    ? 'Create Account'
                    : 'Log In with Email'}
              </button>
            </form>

            <div className="border-t border-[#E2E8F0] dark:border-[#262E3B] pt-4">
              <button
                type="button"
                onClick={onContinueAsGuest}
                disabled={loading}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-transparent hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
              >
                <UserCheck className="w-4 h-4" />
                <span>Continue as Guest</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
