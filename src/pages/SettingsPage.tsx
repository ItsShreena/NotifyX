import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Sliders,
  Check,
  Copy,
  Server,
  RefreshCw,
  Database,
  Bell,
  Mail,
  Smartphone,
  Webhook,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { copyToClipboard } from '../utils/clipboard';
import { preferenceService, ChannelPreferences } from '../services/preferenceService';

export const SettingsPage: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Settings State
  const [orgName, setOrgName] = useState('Acme Core Infrastructure');
  const [slug, setSlug] = useState('acme-core');
  const [maxRetries, setMaxRetries] = useState(3);
  const [backoffSec, setBackoffSec] = useState(15);
  const [dedupWindowSec, setDedupWindowSec] = useState(300);
  const [webhookSigningSecret] = useState(
    'whsec_9941a80f01ba49419b48c0a829104fa2'
  );

  // User Notification Channels Preferences State
  const [channels, setChannels] = useState<ChannelPreferences>({
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: false,
  });
  const [prefLoading, setPrefLoading] = useState(false);
  const [prefSaved, setPrefSaved] = useState(false);

  useEffect(() => {
    async function loadPref() {
      try {
        setPrefLoading(true);
        const data = await preferenceService.getUserPreferences();
        setChannels(data.channels);
      } catch (err) {
        console.error('Failed to load user channel preferences:', err);
      } finally {
        setPrefLoading(false);
      }
    }
    loadPref();
  }, []);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await preferenceService.updateGlobalChannels(channels);
      setPrefSaved(true);
      setTimeout(() => setPrefSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save channel preferences:', err);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">
          Platform & Delivery Settings
        </h1>
        <p className="text-xs text-neutral-400 mt-0.5">
          Manage delivery defaults, recipient channel preferences, cryptographic signing, and deduplication rules.
        </p>
      </div>

      {/* Database Schema & Entity Models */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-neutral-200">
              Core Data Schema & Entity Models
            </h2>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-900/60 px-2 py-0.5 rounded">
            Schema v1.2 Active
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
          {[
            { model: 'User', count: 'users', desc: 'Developer & Admin Identity' },
            { model: 'Application', count: 'applications', desc: 'Workspaces & API Keys' },
            { model: 'Notification', count: 'notifications', desc: 'Immutable Message Audit' },
            { model: 'Delivery', count: 'deliveries', desc: 'Multi-Channel Tracking' },
            { model: 'Preference', count: 'preferences', desc: 'Recipient Channel Opt-Ins' },
          ].map((item) => (
            <div key={item.model} className="p-2.5 bg-neutral-950 border border-neutral-800 rounded">
              <span className="text-neutral-400 font-bold block">{item.model}</span>
              <span className="text-[10px] text-neutral-500 block truncate">{item.count}</span>
              <span className="text-[10px] text-emerald-400 block mt-1">{item.desc}</span>
            </div>
          ))}
        </div>

        <div className="pt-2 text-xs text-neutral-500 font-mono flex items-center justify-between">
          <span>Storage: Enterprise Relational Storage</span>
          <span>Tenant Partitioning: Active</span>
        </div>
      </Card>

      {/* Global Notification Preferences Configuration */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-200">
              Global Notification Channels
            </h2>
          </div>
          <span className="text-xs text-neutral-500 font-mono">NotificationPreference</span>
        </div>

        <p className="text-xs text-neutral-400">
          Manage master channel delivery opt-ins for In-App, Email, and Push. For granular 9-category controls, navigate to the dedicated Preferences view.
        </p>

        <form onSubmit={handleSavePreferences} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: 'inAppEnabled' as keyof ChannelPreferences,
                label: 'In-App',
                desc: 'Real-time WebSocket inbox',
                icon: Bell,
                checked: channels.inAppEnabled,
              },
              {
                id: 'emailEnabled' as keyof ChannelPreferences,
                label: 'Email',
                desc: 'Inbox receipts & alerts',
                icon: Mail,
                checked: channels.emailEnabled,
              },
              {
                id: 'pushEnabled' as keyof ChannelPreferences,
                label: 'Push',
                desc: 'Mobile & Web lock screen',
                icon: Smartphone,
                checked: channels.pushEnabled,
              },
            ].map((ch) => {
              const Icon = ch.icon;
              return (
                <label
                  key={ch.id}
                  className={`flex flex-col p-3 rounded border text-xs cursor-pointer transition-colors ${
                    ch.checked
                      ? 'bg-neutral-900 border-neutral-700 text-white'
                      : 'bg-neutral-950 border-neutral-850 text-neutral-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-neutral-300" />
                      <span className="font-semibold text-xs text-white">{ch.label}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={ch.checked}
                      onChange={(e) =>
                        setChannels((prev) => ({ ...prev, [ch.id]: e.target.checked }))
                      }
                      className="rounded bg-neutral-900 border-neutral-700"
                    />
                  </div>
                  <span className="text-[11px] text-neutral-400 mt-2 font-mono">{ch.desc}</span>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              {prefSaved && (
                <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Channel preferences updated.
                </span>
              )}
              <a
                href="#preferences"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline font-mono flex items-center gap-1"
              >
                <span>Open Categories Matrix (9 categories) &rarr;</span>
              </a>
            </div>
            <Button type="submit" variant="secondary" size="sm" disabled={prefLoading}>
              Save Channel Settings
            </Button>
          </div>
        </form>
      </Card>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Workspace Organization Info */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-800">
            <Sliders className="w-4 h-4 text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-200">
              Workspace Profile
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Organization Name
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Workspace Slug
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
              />
            </div>
          </div>
        </Card>

        {/* Global Security & Webhook Signing */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-800">
            <Shield className="w-4 h-4 text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-200">
              Security & Webhook Signing Secret
            </h2>
          </div>

          <p className="text-xs text-neutral-400 leading-relaxed">
            All outbound webhooks from NotifyX are signed with HMAC-SHA256 headers using this secret
            to verify payload integrity on your receiving servers.
          </p>

          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-md flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Key className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <span className="font-mono text-xs text-neutral-300 truncate">
                {webhookSigningSecret}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy('whsec', webhookSigningSecret)}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white px-2 py-1 rounded hover:bg-neutral-800 transition-colors shrink-0 ml-2"
            >
              {copiedKey === 'whsec' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Secret</span>
                </>
              )}
            </button>
          </div>
        </Card>

        {/* Retry & Fault-Tolerance Policy */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-800">
            <RefreshCw className="w-4 h-4 text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-200">
              Delivery Retry & Deduplication Policy
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Max Retry Attempts
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              />
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Attempts before marking failed.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Exponential Backoff Base (sec)
              </label>
              <input
                type="number"
                min={5}
                max={300}
                value={backoffSec}
                onChange={(e) => setBackoffSec(Number(e.target.value))}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              />
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Base multiplier interval.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Deduplication Window (sec)
              </label>
              <input
                type="number"
                min={60}
                max={86400}
                value={dedupWindowSec}
                onChange={(e) => setDedupWindowSec(Number(e.target.value))}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              />
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Idempotency key TTL.
              </span>
            </div>
          </div>
        </Card>

        {/* Platform Specifications & Security Standards */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-800">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-neutral-200">
              Platform Specifications & Security Standards
            </h2>
          </div>

          <div className="space-y-2 text-xs text-neutral-400">
            <div className="flex items-center justify-between py-1 border-b border-neutral-850">
              <span>API Transport & Cryptography</span>
              <span className="font-mono text-emerald-400">TLS 1.3 / HTTPS Enforced</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-neutral-850">
              <span>Tenant Isolation</span>
              <span className="font-mono text-emerald-400">Multi-Tenant Scoped Partitioning</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-neutral-850">
              <span>Developer Authentication</span>
              <span className="font-mono text-emerald-400">Cryptographic JWT & SHA-256 API Keys</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-neutral-850">
              <span>Dispatch Pipeline</span>
              <span className="font-mono text-emerald-400">High-Throughput Distributed Processing</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span>Transport Rate Limiting</span>
              <span className="font-mono text-emerald-400">Sliding Window Token Bucket (RFC 6598)</span>
            </div>
          </div>
        </Card>

        {/* Action Button */}
        <div className="flex items-center justify-between pt-2">
          {savedSuccess ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              Settings updated successfully.
            </span>
          ) : (
            <span />
          )}

          <Button type="submit" variant="primary" size="sm">
            Save Platform Settings
          </Button>
        </div>
      </form>
    </div>
  );
};
