import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  BarChart3,
  Layers,
  Bell,
  Terminal,
  Settings,
  Send,
  ExternalLink,
  Menu,
  X,
  Radio,
  LogOut,
  User as UserIcon,
  Sliders,
} from 'lucide-react';
import { WebSocketBadge } from '../common/WebSocketBadge';
import { NotificationToastContainer } from '../ui/NotificationToastContainer';
import { Button } from '../ui/Button';
import { NotifyXLogo } from '../common/NotifyXLogo';
import { SendTestNotificationModal } from '../common/SendTestNotificationModal';
import { applicationService } from '../../services/applicationService';
import { notificationService } from '../../services/notificationService';
import { Application } from '../../types/application';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';

export type NavigationPage =
  | 'landing'
  | 'dashboard'
  | 'analytics'
  | 'applications'
  | 'notifications'
  | 'preferences'
  | 'logs'
  | 'settings'
  | 'login'
  | 'signup';

export interface AppLayoutProps {
  currentPage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentPage,
  onNavigate,
  children,
}) => {
  const { user, logout } = useAuth();
  const { latestNotification } = useWebSocket();
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const handleLogout = async () => {
    await logout();
    onNavigate('login');
  };

  const refreshCountsAndApps = async () => {
    try {
      const [apps, unread] = await Promise.all([
        applicationService.getApplications(),
        notificationService.getUnreadCount(),
      ]);
      setApplications(apps);
      setUnreadCount(unread);
    } catch (e) {
      console.error('Failed refreshing layout data', e);
    }
  };

  useEffect(() => {
    refreshCountsAndApps();
    const interval = setInterval(refreshCountsAndApps, 15000);
    return () => clearInterval(interval);
  }, []);

  // Real-time notification arrival updates the unread badge immediately
  useEffect(() => {
    if (latestNotification) {
      setUnreadCount((prev) => prev + 1);
    }
  }, [latestNotification]);

  const navItems = [
    { id: 'dashboard' as NavigationPage, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analytics' as NavigationPage, label: 'Analytics & Monitoring', icon: BarChart3 },
    { id: 'applications' as NavigationPage, label: 'Applications', icon: Layers, badge: applications.length.toString() },
    {
      id: 'notifications' as NavigationPage,
      label: 'Notifications',
      icon: Bell,
      badge: unreadCount > 0 ? `${unreadCount} unread` : undefined,
      badgeHighlight: unreadCount > 0,
    },
    { id: 'preferences' as NavigationPage, label: 'Preferences', icon: Sliders },
    { id: 'logs' as NavigationPage, label: 'Delivery Logs', icon: Terminal },
    { id: 'settings' as NavigationPage, label: 'Settings', icon: Settings },
  ];

  const pageTitles: Record<NavigationPage, string> = {
    landing: 'Home',
    dashboard: 'Developer Dashboard',
    analytics: 'Analytics & Monitoring',
    applications: 'Connected Applications',
    notifications: 'Notification Inbox',
    preferences: 'Notification Preferences',
    logs: 'Delivery & Event Logs',
    settings: 'Infrastructure Settings',
    login: 'Log In',
    signup: 'Create Account',
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col md:flex-row antialiased">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md sticky top-0 z-40">
        <NotifyXLogo size="sm" onClick={() => onNavigate('dashboard')} />

        <div className="flex items-center gap-2">
          <WebSocketBadge />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-neutral-400 hover:text-neutral-100 rounded-md border border-neutral-800"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Desktop Sidebar (and Mobile dropdown drawer) */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:flex flex-col w-full md:w-64 md:min-h-screen border-r border-neutral-800/80 bg-neutral-950 z-30 shrink-0`}
      >
        {/* Brand Area */}
        <div className="hidden md:flex items-center justify-between px-5 h-14 border-b border-neutral-800/80">
          <NotifyXLogo size="md" onClick={() => onNavigate('dashboard')} />
        </div>

        {/* Project Context Box */}
        <div className="p-3">
          <div className="px-3 py-2 rounded-md bg-neutral-900/60 border border-neutral-800/60 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <div className="truncate">
                <p className="font-medium text-neutral-200 truncate">
                  {user?.name || 'Workspace'}
                </p>
                <p className="text-[11px] text-neutral-500 truncate">
                  {user?.email || 'Production Environment'}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded">
              US-EAST
            </span>
          </div>
        </div>

        {/* Primary Navigation Links */}
        <nav className="flex-1 px-3 py-1 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md transition-all relative ${
                  isActive
                    ? 'bg-neutral-800/80 text-white font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {isActive && (
                    <span className="w-1 h-3.5 rounded-full bg-[#B8FF00] shadow-[0_0_8px_rgba(184,255,0,0.5)] -ml-1 mr-0.5 transition-all" />
                  )}
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                      item.badgeHighlight
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/60'
                        : 'text-neutral-400 bg-neutral-900'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Actions & User Profile */}
        <div className="p-3 border-t border-neutral-800/80 space-y-2">
          <Button
            variant="primary"
            size="sm"
            className="w-full text-xs"
            onClick={() => setIsTestModalOpen(true)}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Test Event</span>
          </Button>

          <button
            onClick={() => onNavigate('landing')}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 rounded-md hover:bg-neutral-900 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-neutral-500" />
              <span>Landing Page</span>
            </span>
            <ExternalLink className="w-3 h-3 text-neutral-500" />
          </button>

          {/* User Signout Row */}
          <div className="pt-2 border-t border-neutral-850 flex items-center justify-between px-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-300 font-semibold text-[11px] shrink-0">
                {user?.name ? user.name[0].toUpperCase() : 'D'}
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-neutral-300 truncate">
                  {user?.name || 'Developer'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-neutral-900 rounded transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar (Desktop & Tablet) */}
        <header className="hidden md:flex items-center justify-between px-6 h-14 border-b border-neutral-800/80 bg-neutral-950/60 backdrop-blur-xs sticky top-0 z-20">
          {/* Breadcrumb / Section identification */}
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => onNavigate('dashboard')}
              className="text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              NotifyX
            </button>
            <span className="text-neutral-600">/</span>
            <span className="font-medium text-neutral-200">
              {pageTitles[currentPage] || 'Dashboard'}
            </span>
          </div>

          {/* Right Zone: Status & Quick Controls */}
          <div className="flex items-center gap-3">
            <WebSocketBadge />

            <div className="h-4 w-px bg-neutral-800" />

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTestModalOpen(true)}
              className="text-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Test Dispatch</span>
            </Button>

            <div className="h-4 w-px bg-neutral-800" />

            <div className="flex items-center gap-2 pl-1">
              <span className="text-xs text-neutral-400 font-medium hidden lg:inline">
                {user?.email}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-rose-400 transition-colors py-1 px-2 rounded hover:bg-neutral-900 border border-transparent hover:border-neutral-800"
                title="Log Out of Session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Test Notification Dispatcher Modal */}
      <SendTestNotificationModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        applications={applications}
        onNotificationSent={refreshCountsAndApps}
      />

      {/* Real-Time Floating Notification Toasts */}
      <NotificationToastContainer />
    </div>
  );
};
