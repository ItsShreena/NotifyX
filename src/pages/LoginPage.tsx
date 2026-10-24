import React, { useState } from 'react';
import { ArrowRight, Lock, Mail, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { NotifyXLogo } from '../components/common/NotifyXLogo';
import { useAuth } from '../context/AuthContext';

export interface LoginPageProps {
  onLoginSuccess: () => void;
  onNavigateSignup: () => void;
  onNavigateHome: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onNavigateSignup,
  onNavigateHome,
}) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('developer@notifyx.dev');
  const [password, setPassword] = useState('Password123!');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      await login({ email, password });
      onLoginSuccess();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Invalid email or password.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      await login({
        email: 'developer@notifyx.dev',
        password: 'Password123!',
      });
      onLoginSuccess();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Demo authentication failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between p-6">
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
        <NotifyXLogo size="sm" onClick={onNavigateHome} />

        <button
          onClick={onNavigateHome}
          className="text-xs text-neutral-400 hover:text-[#B8FF00] transition-colors"
        >
          Back to website
        </button>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-sm mx-auto my-auto py-8">
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 shadow-2xl space-y-5">
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-white tracking-tight">
              Developer Sign In
            </h1>
            <p className="text-xs text-neutral-400">
              Access your NotifyX applications, API keys, and logs.
            </p>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-md text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick Demo Access Button */}
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-md space-y-2">
            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span className="font-medium text-neutral-300">Fast Evaluator Mode</span>
              <span className="text-emerald-400 font-mono">1-Click</span>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="w-full text-xs"
              onClick={handleDemoSignIn}
              disabled={loading}
            >
              <span>{loading ? 'Authenticating...' : 'Instant Demo Access'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2 my-2 text-[11px] text-neutral-500 font-mono">
            <div className="h-px bg-neutral-800 flex-1" />
            <span>OR CONTINUE WITH CREDENTIALS</span>
            <div className="h-px bg-neutral-800 flex-1" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Developer Email
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md pl-9 pr-3 py-2 text-neutral-200 focus:outline-none focus:border-[#B8FF00]/50 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-neutral-300">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md pl-9 pr-3 py-2 text-neutral-200 focus:outline-none focus:border-[#B8FF00]/50 transition-colors"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full text-xs mt-2"
              disabled={loading}
            >
              <span>{loading ? 'Verifying Credentials...' : 'Sign In to Console'}</span>
            </Button>
          </form>

          <div className="pt-2 text-center text-xs text-neutral-400">
            <span>Don't have a workspace yet? </span>
            <button
              onClick={onNavigateSignup}
              className="text-white hover:text-[#B8FF00] hover:underline font-medium transition-colors"
            >
              Sign up
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[11px] text-neutral-600 font-mono">
        NotifyX Platform · End-to-end Developer Notification Infrastructure
      </div>
    </div>
  );
};
