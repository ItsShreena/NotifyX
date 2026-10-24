import React, { useState, useEffect } from 'react';
import {
  Bell,
  Mail,
  Smartphone,
  Shield,
  CreditCard,
  Package,
  MessageSquare,
  CheckSquare,
  Rocket,
  Calendar,
  Activity,
  Megaphone,
  Check,
  RotateCcw,
  Sparkles,
  Sliders,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  preferenceService,
  ChannelPreferences,
  CategoryPreferenceItem,
} from '../services/preferenceService';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  security: Shield,
  payments: CreditCard,
  orders: Package,
  comments: MessageSquare,
  tasks: CheckSquare,
  deployments: Rocket,
  reminders: Calendar,
  system: Activity,
  marketing: Megaphone,
};

export const PreferencesPage: React.FC = () => {
  const [channels, setChannels] = useState<ChannelPreferences>({
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: false,
  });
  const [categories, setCategories] = useState<CategoryPreferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const data = await preferenceService.getUserPreferences();
      setChannels(data.channels);
      setCategories(data.categories);
    } catch (err) {
      console.error('Failed to load user preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPreferences();
  }, []);

  const triggerFeedback = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleToggleGlobalChannel = async (channelKey: keyof ChannelPreferences) => {
    const newValue = !channels[channelKey];
    setChannels((prev) => ({ ...prev, [channelKey]: newValue }));
    setSavingKey(`global-${channelKey}`);

    try {
      await preferenceService.updateGlobalChannels({ [channelKey]: newValue });
      triggerFeedback(`Global ${channelKey.replace('Enabled', '')} channel turned ${newValue ? 'ON' : 'OFF'}.`);
    } catch (err) {
      console.error('Failed to update global channel:', err);
      // Revert on error
      setChannels((prev) => ({ ...prev, [channelKey]: !newValue }));
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleCategoryChannel = async (
    categoryName: string,
    channelKey: keyof ChannelPreferences
  ) => {
    const targetCat = categories.find((c) => c.category === categoryName);
    if (!targetCat) return;

    const newValue = !targetCat[channelKey];
    setCategories((prev) =>
      prev.map((c) => (c.category === categoryName ? { ...c, [channelKey]: newValue } : c))
    );
    setSavingKey(`${categoryName}-${channelKey}`);

    try {
      await preferenceService.updateCategory(categoryName, { [channelKey]: newValue });
      triggerFeedback(`Updated ${targetCat.label}: ${channelKey.replace('Enabled', '')} is now ${newValue ? 'ON' : 'OFF'}.`);
    } catch (err) {
      console.error('Failed to update category preference:', err);
      // Revert on error
      setCategories((prev) =>
        prev.map((c) => (c.category === categoryName ? { ...c, [channelKey]: !newValue } : c))
      );
    } finally {
      setSavingKey(null);
    }
  };

  const handleResetToDefaults = async () => {
    setLoading(true);
    try {
      // Re-initialize defaults through backend
      const defaultCats = [
        { cat: 'security', inApp: true, email: true, push: true },
        { cat: 'payments', inApp: true, email: true, push: false },
        { cat: 'orders', inApp: true, email: true, push: false },
        { cat: 'comments', inApp: true, email: false, push: false },
        { cat: 'tasks', inApp: true, email: false, push: false },
        { cat: 'deployments', inApp: true, email: false, push: false },
        { cat: 'reminders', inApp: true, email: true, push: false },
        { cat: 'system', inApp: true, email: false, push: false },
        { cat: 'marketing', inApp: false, email: false, push: false },
      ];

      await preferenceService.updateGlobalChannels({
        inAppEnabled: true,
        emailEnabled: true,
        pushEnabled: false,
      });

      for (const item of defaultCats) {
        await preferenceService.updateCategory(item.cat, {
          inAppEnabled: item.inApp,
          emailEnabled: item.email,
          pushEnabled: item.push,
        });
      }

      await loadPreferences();
      triggerFeedback('Reset all notification preferences to standard factory defaults.');
    } catch (err) {
      console.error('Failed to reset preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse max-w-5xl">
        <div className="h-8 bg-neutral-900 rounded w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-neutral-900/60 rounded-lg" />
          ))}
        </div>
        <div className="h-96 bg-neutral-900/40 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Notification Preferences</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900/60 font-medium">
                User Controls
              </span>
            </h1>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Manage your delivery channels and configure granular opt-ins across each notification category.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccessMsg && (
            <div className="text-xs font-mono text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded border border-emerald-900/60 flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleResetToDefaults} className="text-xs">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Defaults</span>
          </Button>
        </div>
      </div>

      {/* SECTION 1: GLOBAL NOTIFICATION CHANNELS */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">
              Notification Channels
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Master delivery switches. Disabling a channel here suppresses delivery across all categories.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* In-App Notifications */}
          <Card className={`p-4 border transition-colors ${channels.inAppEnabled ? 'border-neutral-700 bg-neutral-900/50' : 'border-neutral-800 bg-neutral-950/40 opacity-70'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${channels.inAppEnabled ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60' : 'bg-neutral-900 text-neutral-500'}`}>
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">In-App Notifications</h3>
                  <span className="text-[10px] text-emerald-400 font-mono">Live WebSocket Delivery</span>
                </div>
              </div>

              {/* Clean Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={channels.inAppEnabled}
                onClick={() => handleToggleGlobalChannel('inAppEnabled')}
                disabled={savingKey === 'global-inAppEnabled'}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  channels.inAppEnabled ? 'bg-emerald-500' : 'bg-neutral-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    channels.inAppEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="text-[11px] text-neutral-400 mt-2.5 leading-relaxed">
              Real-time inbox badges, sound alerts, and floating browser toasts for live application events.
            </p>
            <div className="mt-3 pt-2.5 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono">
              <span className="text-neutral-500">Status</span>
              <span className={channels.inAppEnabled ? 'text-emerald-400 font-bold' : 'text-neutral-500'}>
                {channels.inAppEnabled ? 'ON (Active)' : 'OFF'}
              </span>
            </div>
          </Card>

          {/* Email Notifications */}
          <Card className={`p-4 border transition-colors ${channels.emailEnabled ? 'border-neutral-700 bg-neutral-900/50' : 'border-neutral-800 bg-neutral-950/40 opacity-70'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${channels.emailEnabled ? 'bg-sky-950 text-sky-400 border border-sky-900/60' : 'bg-neutral-900 text-neutral-500'}`}>
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Email Notifications</h3>
                  <span className="text-[10px] text-sky-400 font-mono">Architecturally Prepared</span>
                </div>
              </div>

              {/* Clean Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={channels.emailEnabled}
                onClick={() => handleToggleGlobalChannel('emailEnabled')}
                disabled={savingKey === 'global-emailEnabled'}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  channels.emailEnabled ? 'bg-emerald-500' : 'bg-neutral-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    channels.emailEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="text-[11px] text-neutral-400 mt-2.5 leading-relaxed">
              Order confirmations, billing invoices, security notices, and scheduled digests sent to your inbox.
            </p>
            <div className="mt-3 pt-2.5 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono">
              <span className="text-neutral-500">Status</span>
              <span className={channels.emailEnabled ? 'text-emerald-400 font-bold' : 'text-neutral-500'}>
                {channels.emailEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
          </Card>

          {/* Push Notifications */}
          <Card className={`p-4 border transition-colors ${channels.pushEnabled ? 'border-neutral-700 bg-neutral-900/50' : 'border-neutral-800 bg-neutral-950/40 opacity-70'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${channels.pushEnabled ? 'bg-purple-950 text-purple-400 border border-purple-900/60' : 'bg-neutral-900 text-neutral-500'}`}>
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Push Notifications</h3>
                  <span className="text-[10px] text-purple-400 font-mono">Mobile & Web Push</span>
                </div>
              </div>

              {/* Clean Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={channels.pushEnabled}
                onClick={() => handleToggleGlobalChannel('pushEnabled')}
                disabled={savingKey === 'global-pushEnabled'}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  channels.pushEnabled ? 'bg-emerald-500' : 'bg-neutral-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    channels.pushEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="text-[11px] text-neutral-400 mt-2.5 leading-relaxed">
              Instant alerts delivered directly to mobile lock screens and desktop system notification centers.
            </p>
            <div className="mt-3 pt-2.5 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono">
              <span className="text-neutral-500">Status</span>
              <span className={channels.pushEnabled ? 'text-emerald-400 font-bold' : 'text-neutral-500'}>
                {channels.pushEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* SECTION 2: CATEGORIES MATRIX */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">
              Notification Categories Matrix
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Control channel delivery individually for each category. Changes take effect immediately across all dispatch pipelines.
            </p>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono text-neutral-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>In-App</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              <span>Email</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>Push</span>
            </span>
          </div>
        </div>

        {/* Categories Table Grid */}
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500 uppercase text-[10px]">
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 text-center">In-App</th>
                <th className="py-2.5 px-3 text-center">Email</th>
                <th className="py-2.5 px-3 text-center">Push</th>
                <th className="py-2.5 px-3 text-right">Summary Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-850">
              {categories.map((cat) => {
                const IconComponent = CATEGORY_ICONS[cat.category] || Sliders;
                const activeCount = [cat.inAppEnabled, cat.emailEnabled, cat.pushEnabled].filter(Boolean).length;

                return (
                  <tr key={cat.category} className="hover:bg-neutral-900/30 transition-colors">
                    {/* Category Title & Description */}
                    <td className="py-3 px-3">
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 mt-0.5">
                          <IconComponent className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-neutral-100 font-semibold text-xs font-sans">
                            {cat.label}
                          </div>
                          <div className="text-[11px] text-neutral-400 font-sans mt-0.5">
                            {cat.description}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* In-App Toggle */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryChannel(cat.category, 'inAppEnabled')}
                        disabled={savingKey === `${cat.category}-inAppEnabled`}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-md border transition-all ${
                          cat.inAppEnabled
                            ? 'bg-emerald-950/80 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-600 hover:text-neutral-400'
                        }`}
                        title={`Toggle In-App for ${cat.label}`}
                      >
                        {cat.inAppEnabled ? '✓' : '✗'}
                      </button>
                    </td>

                    {/* Email Toggle */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryChannel(cat.category, 'emailEnabled')}
                        disabled={savingKey === `${cat.category}-emailEnabled`}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-md border transition-all ${
                          cat.emailEnabled
                            ? 'bg-sky-950/80 border-sky-800 text-sky-400 hover:bg-sky-900/60'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-600 hover:text-neutral-400'
                        }`}
                        title={`Toggle Email for ${cat.label}`}
                      >
                        {cat.emailEnabled ? '✓' : '✗'}
                      </button>
                    </td>

                    {/* Push Toggle */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryChannel(cat.category, 'pushEnabled')}
                        disabled={savingKey === `${cat.category}-pushEnabled`}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-md border transition-all ${
                          cat.pushEnabled
                            ? 'bg-purple-950/80 border-purple-800 text-purple-400 hover:bg-purple-900/60'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-600 hover:text-neutral-400'
                        }`}
                        title={`Toggle Push for ${cat.label}`}
                      >
                        {cat.pushEnabled ? '✓' : '✗'}
                      </button>
                    </td>

                    {/* Summary Chip */}
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                          activeCount === 3
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60'
                            : activeCount > 0
                            ? 'bg-neutral-900 text-neutral-300 border border-neutral-800'
                            : 'bg-neutral-950 text-neutral-500 border border-neutral-850'
                        }`}
                      >
                        {activeCount === 3
                          ? 'All Channels ON'
                          : activeCount > 0
                          ? `${activeCount} / 3 Channels`
                          : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* SECTION 3: CRITICAL NOTIFICATIONS POLICY BANNER */}
      <Card className="p-4 bg-amber-950/10 border-amber-900/50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h3 className="font-semibold text-amber-200">
              Critical Priority Notification Policy
            </h3>
            <p className="text-amber-300/80 leading-relaxed">
              When an external service dispatches a notification marked with <code className="text-amber-200 bg-amber-950/60 px-1 py-0.5 rounded font-mono">priority: "critical"</code> (such as security breach alerts or emergency updates), the system applies high-importance visual treatment and priority logging while strictly respecting your channel configurations. NotifyX will never silently bypass user preferences.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};
