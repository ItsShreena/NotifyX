import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Key,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  ExternalLink,
  Shield,
  Search,
  Power,
  Trash2,
  AlertTriangle,
  Clock,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Zap,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { applicationService } from '../services/applicationService';
import { Application, CreateApplicationDTO, DeliveryChannel, Environment } from '../types/application';
import { copyToClipboard } from '../utils/clipboard';
import { formatNumber, formatDateTime } from '../utils/formatters';

export const ApplicationsPage: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEnv, setFilterEnv] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);

  // Key Reveal Modal State (one-time security disclosure)
  const [revealedKeyModal, setRevealedKeyModal] = useState<{
    appName: string;
    key: string;
    isRegenerated: boolean;
  } | null>(null);

  // Action Confirmation Modals
  const [revokeConfirmApp, setRevokeConfirmApp] = useState<Application | null>(null);
  const [deleteConfirmApp, setDeleteConfirmApp] = useState<Application | null>(null);
  const [regenerateConfirmApp, setRegenerateConfirmApp] = useState<Application | null>(null);

  // Copy feedback
  const [copiedKey, setCopiedKey] = useState(false);

  // New App Form State
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEnv, setNewEnv] = useState<Environment>('production');
  const [newRateLimit, setNewRateLimit] = useState(200);
  const [newWebhook, setNewWebhook] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit App Form State
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editEnv, setEditEnv] = useState<Environment>('production');
  const [editRateLimit, setEditRateLimit] = useState(200);
  const [editWebhook, setEditWebhook] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'disabled' | 'paused'>('active');

  const loadApplications = async () => {
    try {
      const data = await applicationService.getApplications();
      setApplications(data);
    } catch (err) {
      console.error('Failed to load applications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const handleCopyRevealedKey = async (keyText: string) => {
    const success = await copyToClipboard(keyText);
    if (success) {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  // Quick preset template for developers
  const applyPreset = (preset: { name: string; desc: string; env: Environment; rateLimit: number }) => {
    setNewName(preset.name);
    setNewDesc(preset.desc);
    setNewEnv(preset.env);
    setNewRateLimit(preset.rateLimit);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await applicationService.createApplication({
        name: newName,
        description: newDesc,
        environment: newEnv,
        rateLimitPerSec: Number(newRateLimit),
        webhookUrl: newWebhook,
        enabledChannels: ['in_app', 'email', 'push'],
      });

      setIsCreateOpen(false);
      setNewName('');
      setNewDesc('');
      setNewWebhook('');

      // Show secure one-time credentials modal
      setRevealedKeyModal({
        appName: res.application.name,
        key: res.apiKey,
        isRegenerated: false,
      });

      await loadApplications();
    } catch (err) {
      console.error('Failed creating application:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    setIsSubmitting(true);
    try {
      await applicationService.updateApplication(selectedApp.id, {
        name: editName,
        description: editDesc,
        environment: editEnv,
        rateLimitPerSec: Number(editRateLimit),
        webhookUrl: editWebhook,
        status: editStatus,
      });

      setIsEditOpen(false);
      setSelectedApp(null);
      await loadApplications();
    } catch (err) {
      console.error('Failed updating application:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (app: Application) => {
    setSelectedApp(app);
    setEditName(app.name);
    setEditDesc(app.description || '');
    setEditEnv(app.environment);
    setEditRateLimit(app.rateLimitPerSec);
    setEditWebhook(app.webhookUrl || '');
    setEditStatus(app.status as 'active' | 'disabled' | 'paused');
    setIsEditOpen(true);
  };

  const handleToggleStatus = async (app: Application) => {
    const newStatus = app.status === 'active' ? 'disabled' : 'active';
    try {
      await applicationService.toggleStatus(app.id, newStatus);
      await loadApplications();
    } catch (err) {
      console.error('Failed toggling status:', err);
    }
  };

  const handleExecuteRegenerateKey = async () => {
    if (!regenerateConfirmApp) return;
    try {
      const res = await applicationService.rollApiKey(regenerateConfirmApp.id);
      const appName = regenerateConfirmApp.name;
      setRegenerateConfirmApp(null);

      // Show secure one-time credentials modal
      setRevealedKeyModal({
        appName,
        key: res.apiKeyFull,
        isRegenerated: true,
      });

      await loadApplications();
    } catch (err) {
      console.error('Failed regenerating API key:', err);
    }
  };

  const handleExecuteRevokeKey = async () => {
    if (!revokeConfirmApp) return;
    try {
      await applicationService.revokeApiKey(revokeConfirmApp.id);
      setRevokeConfirmApp(null);
      await loadApplications();
    } catch (err) {
      console.error('Failed revoking API key:', err);
    }
  };

  const handleExecuteDelete = async () => {
    if (!deleteConfirmApp) return;
    try {
      await applicationService.deleteApplication(deleteConfirmApp.id);
      setDeleteConfirmApp(null);
      await loadApplications();
    } catch (err) {
      console.error('Failed deleting application:', err);
    }
  };

  const filteredApps = applications.filter((app) => {
    const matchesEnv = filterEnv === 'all' || app.environment === filterEnv;
    const matchesStatus = filterStatus === 'all' || app.status === filterStatus;
    const matchesSearch =
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesEnv && matchesStatus && matchesSearch;
  });

  const activeCount = applications.filter((a) => a.status === 'active').length;
  const disabledCount = applications.filter((a) => a.status === 'disabled').length;
  const revokedKeysCount = applications.filter((a) => a.apiKeyStatus === 'revoked').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Connected Applications</span>
            <span className="text-xs font-mono font-normal text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
              {applications.length} registered
            </span>
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Register and manage microservices authorized to dispatch events via the NotifyX infrastructure API.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          <span>Register Application</span>
        </Button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
          <span className="text-[11px] text-neutral-400 block font-medium">Total Workspaces</span>
          <span className="text-lg font-bold text-white mt-0.5 block tabular-nums">{applications.length}</span>
        </div>
        <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
          <span className="text-[11px] text-emerald-400 block font-medium">Active Traffic</span>
          <span className="text-lg font-bold text-emerald-400 mt-0.5 block tabular-nums">{activeCount}</span>
        </div>
        <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
          <span className="text-[11px] text-neutral-400 block font-medium">Disabled Apps</span>
          <span className="text-lg font-bold text-neutral-400 mt-0.5 block tabular-nums">{disabledCount}</span>
        </div>
        <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
          <span className="text-[11px] text-rose-400 block font-medium">Revoked Credentials</span>
          <span className="text-lg font-bold text-rose-400 mt-0.5 block tabular-nums">{revokedKeysCount}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-neutral-900/40 p-2.5 rounded-lg border border-neutral-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Environment Filter */}
          <div className="flex items-center gap-1 p-0.5 bg-neutral-950 rounded-md border border-neutral-800 text-xs">
            {[
              { id: 'all', label: 'All Envs' },
              { id: 'production', label: 'Production' },
              { id: 'staging', label: 'Staging' },
              { id: 'development', label: 'Dev' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterEnv(tab.id)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  filterEnv === tab.id
                    ? 'bg-neutral-800 text-white font-medium shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 p-0.5 bg-neutral-950 rounded-md border border-neutral-800 text-xs">
            {[
              { id: 'all', label: 'All Status' },
              { id: 'active', label: 'Active' },
              { id: 'disabled', label: 'Disabled' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  filterStatus === tab.id
                    ? 'bg-neutral-800 text-white font-medium shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search applications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md pl-8 pr-3 py-1.5 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          />
        </div>
      </div>

      {/* Applications Grid */}
      {filteredApps.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={searchQuery || filterEnv !== 'all' || filterStatus !== 'all' ? "No applications match your filter" : "No applications registered yet"}
          description={
            searchQuery || filterEnv !== 'all' || filterStatus !== 'all'
              ? "Try adjusting your search criteria or clearing active filters."
              : "Register your first application to provision API keys and begin dispatching notifications across multiple channels."
          }
          actionLabel={searchQuery || filterEnv !== 'all' || filterStatus !== 'all' ? undefined : "Register Application"}
          onAction={searchQuery || filterEnv !== 'all' || filterStatus !== 'all' ? undefined : () => setIsCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
          {filteredApps.map((app) => {
          const isKeyActive = app.apiKeyStatus !== 'revoked';
          const isAppActive = app.status === 'active';

          return (
            <Card
              key={app.id}
              className={`p-5 flex flex-col justify-between transition-colors border ${
                !isAppActive
                  ? 'bg-neutral-950/80 border-neutral-850 opacity-90'
                  : 'bg-neutral-900/50 border-neutral-800'
              }`}
            >
              <div className="space-y-4">
                {/* Header: Name, Environment & Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white truncate tracking-tight">
                        {app.name}
                      </h3>
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                          app.environment === 'production'
                            ? 'bg-neutral-900 text-neutral-300 border-neutral-700'
                            : 'bg-neutral-950 text-neutral-400 border-neutral-800'
                        }`}
                      >
                        {app.environment}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-neutral-500 block mt-0.5 truncate">
                      ID: {app.id}
                    </span>
                  </div>

                  {/* Application Status Badge */}
                  <div className="shrink-0">
                    {isAppActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-900/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/80 text-rose-400 border border-rose-900/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        <span>Disabled</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                  {app.description || 'No description provided.'}
                </p>

                {/* API Key Status & Identifier Box */}
                <div className="p-3 rounded-md bg-neutral-950 border border-neutral-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400 font-medium flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-neutral-500" />
                      <span>API Key Credential</span>
                    </span>

                    {/* API Key Status */}
                    {isKeyActive ? (
                      <span className="text-emerald-400 font-mono text-[10px] bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-900/40">
                        Active Key
                      </span>
                    ) : (
                      <span className="text-rose-400 font-mono text-[10px] bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-900/40">
                        Revoked
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs ${
                        isKeyActive ? 'text-neutral-200' : 'text-neutral-500 line-through'
                      }`}
                    >
                      {app.apiKeyPreview}
                    </span>

                    <div className="flex items-center gap-1">
                      {isKeyActive ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2 text-neutral-400 hover:text-white"
                            onClick={() => setRegenerateConfirmApp(app)}
                            title="Regenerate API Key"
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1" />
                            <span>Regenerate</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
                            onClick={() => setRevokeConfirmApp(app)}
                            title="Revoke API Key"
                          >
                            <span>Revoke</span>
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-xs h-7 px-2.5"
                          onClick={() => handleExecuteRegenerateKey()}
                        >
                          <Key className="w-3.5 h-3.5 mr-1" />
                          <span>Generate New Key</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dashboard Metadata Grid (Application Name, Status, Created date, API key status, Notification count, Last activity) */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-800/80 text-xs">
                  <div>
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Created</span>
                    <span className="text-neutral-300 font-mono text-[11px] block mt-0.5">
                      {formatDateTime(app.createdAt).split(',')[0]}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Notifications</span>
                    <span className="text-neutral-200 font-mono font-medium text-[11px] block mt-0.5 tabular-nums">
                      {formatNumber(app.totalNotifications)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Last Activity</span>
                    <span className="text-neutral-300 font-mono text-[11px] block mt-0.5 truncate">
                      {app.lastActivityAt ? formatDateTime(app.lastActivityAt).split(',')[0] : 'Just now'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Action Controls Footer */}
              <div className="pt-4 border-t border-neutral-800/80 flex items-center justify-between gap-2 mt-4">
                {/* Disable / Enable Toggle */}
                <Button
                  variant={isAppActive ? 'outline' : 'secondary'}
                  size="sm"
                  className="text-xs"
                  onClick={() => handleToggleStatus(app)}
                >
                  <Power className={`w-3.5 h-3.5 ${isAppActive ? 'text-amber-400' : 'text-emerald-400'}`} />
                  <span>{isAppActive ? 'Disable Traffic' : 'Enable Traffic'}</span>
                </Button>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => openEditModal(app)}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-neutral-500 hover:text-rose-400 hover:bg-rose-950/30"
                    onClick={() => setDeleteConfirmApp(app)}
                    title="Delete Application"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        </div>
      )}

      {/* Modal: Create Application */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register Application"
        description="Provision NotifyX credentials and API authorization for an external software client."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {/* Quick Presets Strip */}
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-md space-y-2">
            <span className="text-[11px] font-medium text-neutral-400 block">
              Quick Industry Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                {
                  name: 'ShopEasy',
                  desc: 'Direct-to-consumer store with real-time order tracking, checkout alerts, and package dispatch updates.',
                  env: 'production' as Environment,
                  rateLimit: 300,
                },
                {
                  name: 'CollegePortal',
                  desc: 'University academic portal, exam schedules, grading alerts, and tuition fee notices.',
                  env: 'production' as Environment,
                  rateLimit: 150,
                },
                {
                  name: 'TaskFlow',
                  desc: 'Agile team collaboration workspace, sprints, code reviews, and mention notifications.',
                  env: 'staging' as Environment,
                  rateLimit: 100,
                },
                {
                  name: 'DeployMonitor',
                  desc: 'Continuous integration and infrastructure deployment pipeline monitoring and pager alerts.',
                  env: 'production' as Environment,
                  rateLimit: 500,
                },
              ].map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="px-2.5 py-1 text-[11px] font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded border border-neutral-750 transition-colors"
                >
                  + {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Application Name *
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. ShopEasy, CollegePortal, TaskFlow, DeployMonitor"
              className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Target Environment
              </label>
              <select
                value={newEnv}
                onChange={(e) => setNewEnv(e.target.value as Environment)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              >
                <option value="production">Production (nx_live_...)</option>
                <option value="staging">Staging (nx_test_...)</option>
                <option value="development">Development (nx_test_...)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Rate Limit (Req/sec)
              </label>
              <input
                type="number"
                value={newRateLimit}
                onChange={(e) => setNewRateLimit(Number(e.target.value))}
                min={10}
                max={5000}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Primary use case or domain context..."
              className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Default Webhook URL (Optional)
            </label>
            <input
              type="url"
              value={newWebhook}
              onChange={(e) => setNewWebhook(e.target.value)}
              placeholder="https://api.yourdomain.com/webhooks/notifyx"
              className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
              <span>{isSubmitting ? 'Registering...' : 'Register & Generate API Key'}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Application */}
      {selectedApp && (
        <Modal
          isOpen={isEditOpen}
          onClose={() => {
            setIsEditOpen(false);
            setSelectedApp(null);
          }}
          title={`Edit ${selectedApp.name}`}
          description="Update application profile, environment routing, and throughput limits."
          maxWidth="lg"
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Application Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'active' | 'disabled' | 'paused')}
                  className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
                >
                  <option value="active">Active (Processing Traffic)</option>
                  <option value="disabled">Disabled (Block Ingestion)</option>
                  <option value="paused">Paused (Temporary 429)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Rate Limit (Req/sec)
                </label>
                <input
                  type="number"
                  value={editRateLimit}
                  onChange={(e) => setEditRateLimit(Number(e.target.value))}
                  min={10}
                  max={5000}
                  className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Webhook Receiver URL
              </label>
              <input
                type="url"
                value={editWebhook}
                onChange={(e) => setEditWebhook(e.target.value)}
                placeholder="https://api.yourdomain.com/webhooks/notifyx"
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditOpen(false);
                  setSelectedApp(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                <span>{isSubmitting ? 'Saving...' : 'Save Application Changes'}</span>
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Secure One-Time API Key Reveal */}
      {revealedKeyModal && (
        <Modal
          isOpen={Boolean(revealedKeyModal)}
          onClose={() => setRevealedKeyModal(null)}
          title={revealedKeyModal.isRegenerated ? 'API Key Regenerated' : 'API Key Generated'}
          description={`Credentials for ${revealedKeyModal.appName}. Copy this key now.`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="p-3 bg-amber-950/30 border border-amber-900/60 rounded-md flex items-start gap-2.5 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">One-Time Security Disclosure</p>
                <p className="text-amber-200/90 leading-relaxed text-[11px]">
                  For your security, NotifyX calculates and stores only an irreversible SHA-256 cryptographic hash of this API key. We will never be able to display this key again.
                </p>
              </div>
            </div>

            {/* Key Box */}
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                Full API Key (Convention: <code className="text-emerald-400">nx_live_...</code> / <code className="text-emerald-400">nx_test_...</code>)
              </label>
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-md flex items-center justify-between font-mono text-xs text-emerald-400">
                <span className="select-all break-all">{revealedKeyModal.key}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 ml-3 text-xs"
                  onClick={() => handleCopyRevealedKey(revealedKeyModal.key)}
                >
                  {copiedKey ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Key</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* API Authentication Usage Guide */}
            <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-md space-y-1.5 text-xs">
              <span className="font-semibold text-neutral-300 block">How to Authenticate External Calls:</span>
              <p className="text-neutral-400 text-[11px]">
                Pass this key in the HTTP <code className="text-neutral-200">Authorization</code> header when calling NotifyX API:
              </p>
              <pre className="p-2 bg-neutral-950 rounded border border-neutral-850 font-mono text-[11px] text-neutral-300 overflow-x-auto">
{`curl -X POST https://api.notifyx.dev/api/v1/notify \\
  -H "Authorization: Bearer ${revealedKeyModal.key}" \\
  -H "Content-Type: application/json" \\
  -d '{"recipientId": "usr_991", "title": "Welcome", "message": "Your order is confirmed."}'`}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setRevealedKeyModal(null)}
              >
                I Have Safely Saved This Key
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Regenerate API Key */}
      {regenerateConfirmApp && (
        <Modal
          isOpen={Boolean(regenerateConfirmApp)}
          onClose={() => setRegenerateConfirmApp(null)}
          title="Regenerate API Key?"
          description={`Are you sure you want to regenerate credentials for ${regenerateConfirmApp.name}?`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-neutral-400 leading-relaxed">
              Regenerating will <strong className="text-rose-400 font-semibold">immediately invalidate</strong> the current key ({regenerateConfirmApp.apiKeyPreview}). Any external service using the old key will fail to authenticate until updated with the new key.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setRegenerateConfirmApp(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleExecuteRegenerateKey}>
                Confirm & Roll Key
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Revoke API Key */}
      {revokeConfirmApp && (
        <Modal
          isOpen={Boolean(revokeConfirmApp)}
          onClose={() => setRevokeConfirmApp(null)}
          title="Revoke API Key?"
          description={`Revoke credentials for ${revokeConfirmApp.name}?`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-neutral-400 leading-relaxed">
              Revoking this API key will immediately block all external notification dispatches from this application until you generate a new key.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setRevokeConfirmApp(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleExecuteRevokeKey}>
                Revoke Key Now
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Delete Application */}
      {deleteConfirmApp && (
        <Modal
          isOpen={Boolean(deleteConfirmApp)}
          onClose={() => setDeleteConfirmApp(null)}
          title="Delete Application?"
          description={`Permanently delete ${deleteConfirmApp.name}?`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-md text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>
                Warning: This action is permanent. All notifications, delivery histories, and recipient preferences belonging to this application will be cascade-deleted.
              </span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmApp(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleExecuteDelete}>
                Delete Permanently
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
