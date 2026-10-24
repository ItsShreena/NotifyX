/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { AppLayout, NavigationPage } from './components/layout/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { LogsPage } from './pages/LogsPage';
import { PreferencesPage } from './pages/PreferencesPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';

const PROTECTED_PAGES: NavigationPage[] = [
  'dashboard',
  'analytics',
  'applications',
  'notifications',
  'preferences',
  'logs',
  'settings',
];

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<NavigationPage>(() => {
    const hash = window.location.hash.replace('#', '');
    const validPages: NavigationPage[] = [
      'landing',
      'dashboard',
      'analytics',
      'applications',
      'notifications',
      'preferences',
      'logs',
      'settings',
      'login',
      'signup',
    ];
    if (validPages.includes(hash as NavigationPage)) {
      return hash as NavigationPage;
    }
    return 'landing';
  });

  const navigateTo = (page: NavigationPage) => {
    setCurrentPage(page);
    window.location.hash = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const validPages: NavigationPage[] = [
        'landing',
        'dashboard',
        'analytics',
        'applications',
        'notifications',
        'preferences',
        'logs',
        'settings',
        'login',
        'signup',
      ];
      if (validPages.includes(hash as NavigationPage)) {
        setCurrentPage(hash as NavigationPage);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Protected Route Interceptor:
  // When auth verification completes, redirect unauthenticated users away from protected pages
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated && PROTECTED_PAGES.includes(currentPage)) {
        navigateTo('login');
      } else if (isAuthenticated && (currentPage === 'login' || currentPage === 'signup')) {
        navigateTo('dashboard');
      }
    }
  }, [isLoading, isAuthenticated, currentPage]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-neutral-400 font-mono text-xs space-y-3">
        <div className="w-6 h-6 border-2 border-neutral-700 border-t-neutral-100 rounded-full animate-spin" />
        <span className="tracking-wide text-neutral-300">Validating developer session...</span>
      </div>
    );
  }

  // Unauthenticated access guard
  if (!isAuthenticated && PROTECTED_PAGES.includes(currentPage)) {
    return (
      <LoginPage
        onLoginSuccess={() => navigateTo('dashboard')}
        onNavigateSignup={() => navigateTo('signup')}
        onNavigateHome={() => navigateTo('landing')}
      />
    );
  }

  if (currentPage === 'landing') {
    return (
      <LandingPage
        onEnterApp={() => navigateTo(isAuthenticated ? 'dashboard' : 'login')}
        onNavigateLogin={() => navigateTo('login')}
        onNavigateSignup={() => navigateTo('signup')}
      />
    );
  }

  if (currentPage === 'login') {
    return (
      <LoginPage
        onLoginSuccess={() => navigateTo('dashboard')}
        onNavigateSignup={() => navigateTo('signup')}
        onNavigateHome={() => navigateTo('landing')}
      />
    );
  }

  if (currentPage === 'signup') {
    return (
      <SignupPage
        onSignupSuccess={() => navigateTo('dashboard')}
        onNavigateLogin={() => navigateTo('login')}
        onNavigateHome={() => navigateTo('landing')}
      />
    );
  }

  // Authenticated Developer Console Views
  return (
    <AppLayout currentPage={currentPage} onNavigate={navigateTo}>
      {currentPage === 'dashboard' && (
        <DashboardPage
          onNavigateToNotifications={() => navigateTo('notifications')}
          onNavigateToApplications={() => navigateTo('applications')}
          onNavigateToLogs={() => navigateTo('logs')}
        />
      )}

      {currentPage === 'analytics' && (
        <AnalyticsPage
          onNavigateToNotifications={() => navigateTo('notifications')}
          onNavigateToApplications={() => navigateTo('applications')}
        />
      )}

      {currentPage === 'applications' && <ApplicationsPage />}

      {currentPage === 'notifications' && <NotificationsPage />}

      {currentPage === 'preferences' && <PreferencesPage />}

      {currentPage === 'logs' && <LogsPage />}

      {currentPage === 'settings' && <SettingsPage />}
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <AppContent />
      </WebSocketProvider>
    </AuthProvider>
  );
}
