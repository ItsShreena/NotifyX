import React, { useState } from 'react';
import { ArrowRight, Lock, Mail, User, Building, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { NotifyXLogo } from '../components/common/NotifyXLogo';
import { useAuth } from '../context/AuthContext';

export interface SignupPageProps {
  onSignupSuccess: () => void;
  onNavigateLogin: () => void;
  onNavigateHome: () => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({
  onSignupSuccess,
  onNavigateLogin,
  onNavigateHome,
}) => {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      await signup({
        name,
        email,
        password,
      });
      onSignupSuccess();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Registration failed. Please try again.'
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

      {/* Signup Card */}
      <div className="w-full max-w-sm mx-auto my-auto py-8">
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 shadow-2xl space-y-5">
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-white tracking-tight">
              Create NotifyX Workspace
            </h1>
            <p className="text-xs text-neutral-400">
              Start integrating notifications into your software stack.
            </p>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-md text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md pl-9 pr-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  placeholder="alex@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md pl-9 pr-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Organization / Team Name
              </label>
              <div className="relative">
                <Building className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Acme Engineering"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md pl-9 pr-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="Minimum 8 characters"
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
              className="w-full text-xs mt-3"
              disabled={loading}
            >
              <span>{loading ? 'Creating Workspace...' : 'Create Account & Continue'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </form>

          <div className="pt-2 text-center text-xs text-neutral-400">
            <span>Already registered? </span>
            <button
              onClick={onNavigateLogin}
              className="text-white hover:text-[#B8FF00] hover:underline font-medium transition-colors"
            >
              Log in
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
