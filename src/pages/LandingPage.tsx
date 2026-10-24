import React, { useState } from 'react';
import {
  ArrowRight,
  Code2,
  Check,
  Copy,
  Terminal,
  Layers,
  ShieldCheck,
  Send,
  Sparkles,
  Smartphone,
  Mail,
  Webhook,
  MessageSquare,
  Server,
  Zap,
  Bell,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { NotifyXLogo } from '../components/common/NotifyXLogo';
import { copyToClipboard } from '../utils/clipboard';

export interface LandingPageProps {
  onEnterApp: () => void;
  onNavigateLogin: () => void;
  onNavigateSignup: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterApp,
  onNavigateLogin,
  onNavigateSignup,
}) => {
  const [activeSnippetTab, setActiveSnippetTab] = useState<'curl' | 'typescript' | 'python'>('typescript');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Interactive sandbox state
  const [sandboxChannel, setSandboxChannel] = useState<'in_app' | 'email' | 'webhook' | 'sms'>('in_app');
  const [sandboxPreset, setSandboxPreset] = useState<'ecom' | 'devops' | 'banking' | 'college'>('ecom');
  const [sandboxDelivered, setSandboxDelivered] = useState(true);

  const snippets = {
    typescript: `import { NotifyX } from '@notifyx/sdk';

const notifyx = new NotifyX({
  apiKey: process.env.NOTIFYX_API_KEY, // nx_live_...
});

await notifyx.send({
  application: 'apex-commerce',
  recipient: 'usr_cst_9841',
  event: 'order.shipped',
  priority: 'high',
  channels: ['email', 'in_app'],
  payload: {
    orderId: '4821',
    carrier: 'FedEx Priority',
    trackingUrl: 'https://apexcommerce.store/track/4821',
  },
});`,
    curl: `curl -X POST https://api.notifyx.dev/v1/notifications \\
  -H "Authorization: Bearer nx_live_9281a0e8c7..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "application": "apex-commerce",
    "recipient": "usr_cst_9841",
    "event": "order.shipped",
    "priority": "high",
    "channels": ["email", "in_app"],
    "payload": {
      "orderId": "4821",
      "carrier": "FedEx Priority"
    }
  }'`,
    python: `from notifyx import NotifyX

client = NotifyX(api_key="nx_live_9281a0e8c7...")

response = client.notifications.send(
    application="apex-commerce",
    recipient="usr_cst_9841",
    event="order.shipped",
    priority="high",
    channels=["email", "in_app"],
    payload={
        "order_id": "4821",
        "carrier": "FedEx Priority"
    }
)`,
  };

  const handleCopyCode = async () => {
    const ok = await copyToClipboard(snippets[activeSnippetTab]);
    if (ok) {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  const presetData = {
    ecom: {
      app: 'Apex Commerce (E-Commerce)',
      title: 'Order #4821 has been shipped',
      body: 'Your package is on its way via FedEx Priority. Expected delivery Tuesday by 5:00 PM.',
      recipient: 'customer_91@gmail.com',
      badge: 'Order Tracking',
    },
    devops: {
      app: 'CloudOps Deployer (SaaS / DevOps)',
      title: 'Your deployment completed successfully',
      body: 'Production release v2.14.0 deployed to us-east-1 cluster across 16 healthy pods.',
      recipient: 'alex.lead@company.internal',
      badge: 'Infrastructure',
    },
    banking: {
      app: 'PayStream Global (FinTech / Payments)',
      title: 'Payment of ₹2,499 was successful',
      body: 'UPI transaction confirmed for Order #PAY-9912. Settled to primary account.',
      recipient: '+91 98765 43210',
      badge: 'Instant Settlement',
    },
    college: {
      app: 'CampusPortal Academic (EdTech)',
      title: 'Assignment deadline is tomorrow',
      body: 'Distributed Systems: Lab 3 submission closes on Oct 3 at 11:59 PM.',
      recipient: 'student_441@university.edu',
      badge: 'Academic Notice',
    },
  };

  const currentPreset = presetData[sandboxPreset];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Top Bar Contract (Brand - Links - Actions) */}
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40">
        {/* Zone 1: Single text wordmark */}
        <NotifyXLogo size="md" onClick={onEnterApp} />

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-neutral-400">
          <a href="#features" className="hover:text-[#B8FF00] transition-colors">Features</a>
          <a href="#architecture" className="hover:text-[#B8FF00] transition-colors">Architecture</a>
          <a href="#applications" className="hover:text-[#B8FF00] transition-colors">Supported Use Cases</a>
          <a href="#sandbox" className="hover:text-[#B8FF00] transition-colors">Interactive Sandbox</a>
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateLogin}
            className="text-xs font-medium text-neutral-300 hover:text-[#B8FF00] px-2 py-1 transition-colors"
          >
            Log In
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={onEnterApp}
          >
            <span>Launch Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 lg:px-12 pt-16 pb-20 max-w-6xl mx-auto w-full">
        <div className="flex flex-col items-center text-center space-y-5">
          <div className="inline-flex items-center gap-2 text-xs text-neutral-400 border border-neutral-800/80 bg-neutral-900/60 rounded-full px-3.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-neutral-300">Developer Notification Infrastructure</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white max-w-4xl text-balance">
            Reliable{' '}
            <span className="relative inline-block text-[#B8FF00]">
              notifications
              <span
                className="absolute left-0 -bottom-1 sm:-bottom-1.5 w-full h-[2px] sm:h-[3px] bg-[#B8FF00] rounded-full"
                aria-hidden="true"
              />
            </span>{' '}
            for modern applications.
          </h1>

          <p className="text-base sm:text-lg text-neutral-400 max-w-2xl text-balance font-normal leading-relaxed">
            Application-agnostic notification infrastructure. Connect e-commerce, SaaS, banking,
            academic portals, and internal tools through a unified API with guaranteed delivery.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="primary"
              size="md"
              onClick={onEnterApp}
              className="text-sm px-5 py-2.5"
            >
              <span>Explore Developer Console</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={onNavigateSignup}
              className="text-sm px-5 py-2.5"
            >
              <span>Create Account</span>
            </Button>
          </div>

          {/* Quick trust metrics */}
          <div className="flex items-center gap-6 pt-4 text-xs text-neutral-500 font-mono">
            <span>MULTI-CHANNEL</span>
            <span className="text-neutral-700">/</span>
            <span>REST API</span>
            <span className="text-neutral-700">/</span>
            <span>ZERO VENDOR LOCK-IN</span>
          </div>
        </div>

        {/* Code Showcase & Interactive Tab */}
        <div className="mt-14 bg-neutral-900/70 border border-neutral-800 rounded-lg overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/90 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
              <span className="ml-2 font-mono text-neutral-400">
                <span className="text-[#B8FF00] font-semibold text-[11px] mr-1.5">POST</span>
                api.notifyx.dev/v1/notifications
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-neutral-950 p-0.5 rounded-md border border-neutral-800 text-[11px]">
                {(['typescript', 'curl', 'python'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveSnippetTab(tab)}
                    className={`px-2.5 py-1 rounded transition-colors uppercase font-mono ${
                      activeSnippetTab === tab
                        ? 'bg-neutral-800 text-white font-medium border-b-2 border-[#B8FF00]'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <button
                onClick={handleCopyCode}
                className="p-1.5 text-neutral-400 hover:text-[#B8FF00] hover:bg-neutral-800 rounded transition-colors"
                title="Copy code"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <pre className="p-5 text-xs font-mono text-neutral-300 overflow-x-auto leading-relaxed selection:bg-neutral-800">
            <code>{snippets[activeSnippetTab]}</code>
          </pre>
        </div>
      </section>

      {/* Architectural Concept Pipeline */}
      <section id="architecture" className="px-6 lg:px-12 py-16 border-t border-neutral-800/80 bg-neutral-950">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 text-center md:text-left">
            <p className="text-xs uppercase font-mono text-neutral-500 tracking-wider mb-1">
              Architecture & Lifecycle
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              From Event Trigger to Guaranteed Delivery
            </h2>
            <p className="text-sm text-neutral-400 mt-1 max-w-xl">
              High-throughput pipeline decoupling notification logic from your business services.
            </p>
          </div>

          {/* Decorative data-flow indicator reinforcing notification infrastructure */}
          <div className="hidden md:flex items-center gap-2.5 mb-4 px-1 text-[11px] font-mono text-neutral-500">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B8FF00] shadow-[0_0_8px_rgba(184,255,0,0.6)]" />
            <span className="text-neutral-300 font-medium">Pipeline Stream</span>
            <div className="flex-1 h-px bg-gradient-to-r from-[#B8FF00]/40 via-neutral-800 to-transparent" />
            <span className="text-[10px] text-neutral-500 tracking-wider">EVENT ROUTING CORE</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {[
              {
                step: '01',
                title: 'External App',
                desc: 'E-commerce, SaaS, Banks, Portals dispatches event payload via SDK or REST.',
                icon: Server,
              },
              {
                step: '02',
                title: 'NotifyX API',
                desc: 'Fast authentication, schema validation, rate-limiting, and idempotency checks.',
                icon: Terminal,
              },
              {
                step: '03',
                title: 'Processing',
                desc: 'User preferences, deduplication, translation, and channel routing logic.',
                icon: Zap,
              },
              {
                step: '04',
                title: 'Queue & Worker',
                desc: 'Fault-tolerant background dispatch queue with exponential backoff retries.',
                icon: Layers,
              },
              {
                step: '05',
                title: 'Channels',
                desc: 'Multi-target delivery: In-App, Email, SMS, Webhooks, and Push.',
                icon: Send,
              },
            ].map((node) => {
              const Icon = node.icon;
              return (
                <div
                  key={node.step}
                  className="bg-neutral-900/40 border border-neutral-800/80 hover:border-[#B8FF00]/30 rounded-lg p-4 flex flex-col justify-between transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-neutral-500 font-mono mb-3">
                      <span>{node.step}</span>
                      <Icon className="w-4 h-4 text-neutral-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-neutral-200 mb-1">{node.title}</h3>
                    <p className="text-xs text-neutral-400 leading-normal">{node.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Multi-Vertical Application Support */}
      <section id="applications" className="px-6 lg:px-12 py-16 border-t border-neutral-800/80 bg-neutral-900/20">
        <div className="max-w-6xl mx-auto">
          <div className="mb-10 text-center md:text-left">
            <p className="text-xs uppercase font-mono text-neutral-500 tracking-wider mb-1">
              Application-Agnostic
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Built for Every Modern Workload
            </h2>
            <p className="text-sm text-neutral-400 mt-1 max-w-xl">
              NotifyX is not confined to one vertical. It powers alerts across any application domain.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                title: 'E-Commerce Applications',
                example: '"Order #4821 has been shipped"',
                channels: 'Email, SMS, In-App',
                desc: 'Order confirmations, fulfillment alerts, price drop notices, delivery updates.',
              },
              {
                title: 'SaaS & DevOps Platforms',
                example: '"Your deployment completed successfully"',
                channels: 'In-App, Webhook, Email',
                desc: 'Build pipelines, system alerts, cluster health, quota threshold warnings.',
              },
              {
                title: 'Academic & College Portals',
                example: '"Assignment deadline is tomorrow"',
                channels: 'Push, In-App, Email',
                desc: 'Course assignments, tuition payment reminders, exam schedules, grade releases.',
              },
              {
                title: 'Banking & FinTech',
                example: '"Payment of ₹2,499 was successful"',
                channels: 'SMS, Email, In-App',
                desc: 'Instant transaction confirmations, fraud detection warnings, invoice receipts.',
              },
              {
                title: 'Project Management & Collaboration',
                example: '"New comment on your task"',
                channels: 'In-App, Push, Webhooks',
                desc: 'Task mentions, review approvals, sprint deadlines, status changes.',
              },
              {
                title: 'Enterprise Internal Tools',
                example: '"Quarterly compliance training due"',
                channels: 'Email, Webhook, In-App',
                desc: 'Employee self-service, IT ticket progress, HR benefits enrollment.',
              },
            ].map((app, idx) => (
              <div
                key={idx}
                className="bg-neutral-900/50 border border-neutral-800/80 rounded-lg p-5 flex flex-col justify-between"
              >
                <div>
                  <h3 className="text-sm font-semibold text-neutral-200 mb-2">{app.title}</h3>
                  <div className="text-xs font-mono text-neutral-300 bg-neutral-950 p-2.5 rounded border border-neutral-800/60 mb-3">
                    {app.example}
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">{app.desc}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-neutral-800/60 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                  <span>CHANNELS</span>
                  <span className="text-neutral-400">{app.channels}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Sandbox Simulator */}
      <section id="sandbox" className="px-6 lg:px-12 py-16 border-t border-neutral-800/80 bg-neutral-950">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <p className="text-xs uppercase font-mono text-neutral-500 tracking-wider mb-1">
              Interactive Test Bench
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Test Real Notification Payloads
            </h2>
            <p className="text-sm text-neutral-400 mt-1">
              Switch domain presets and preview how NotifyX routes notifications to end users.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Control Column */}
            <div className="lg:col-span-5 bg-neutral-900/40 border border-neutral-800/80 rounded-lg p-5 space-y-5">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-2">
                  Select Application Preset
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'ecom', label: 'E-Commerce' },
                    { id: 'devops', label: 'SaaS / DevOps' },
                    { id: 'banking', label: 'FinTech / Pay' },
                    { id: 'college', label: 'College Portal' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSandboxPreset(p.id as any)}
                      className={`text-xs px-3 py-2 rounded-md font-medium text-left transition-colors ${
                        sandboxPreset === p.id
                          ? 'bg-neutral-800 text-white border border-[#B8FF00]/40 shadow-xs'
                          : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-2">
                  Target Channel
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'in_app', label: 'In-App', icon: Bell },
                    { id: 'email', label: 'Email', icon: Mail },
                    { id: 'webhook', label: 'Webhook', icon: Webhook },
                    { id: 'sms', label: 'SMS', icon: Smartphone },
                  ].map((ch) => {
                    const Icon = ch.icon;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => setSandboxChannel(ch.id as any)}
                        className={`flex flex-col items-center justify-center p-2 rounded-md border text-xs transition-colors ${
                          sandboxChannel === ch.id
                            ? 'bg-neutral-800 border-[#B8FF00]/50 text-white shadow-xs'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <Icon className="w-4 h-4 mb-1" />
                        <span className="text-[11px]">{ch.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    setSandboxDelivered(false);
                    setTimeout(() => setSandboxDelivered(true), 300);
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Re-trigger Dispatch</span>
                </Button>
              </div>
            </div>

            {/* Preview Column */}
            <div className="lg:col-span-7 bg-neutral-900/60 border border-neutral-800 rounded-lg p-6">
              <div className="flex items-center justify-between text-xs text-neutral-400 border-b border-neutral-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-neutral-500">Source:</span>
                  <span className="font-semibold text-neutral-200">{currentPreset.app}</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-emerald-400">Delivered</span>
                </div>
              </div>

              {/* Rendered Notification Card */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400 font-mono text-[11px]">
                    To: {currentPreset.recipient}
                  </span>
                  <span className="text-neutral-500 text-[11px]">Just now</span>
                </div>

                <h4 className="text-sm font-semibold text-white">{currentPreset.title}</h4>
                <p className="text-xs text-neutral-300 leading-relaxed">{currentPreset.body}</p>

                <div className="pt-3 flex items-center justify-between text-xs border-t border-neutral-850">
                  <span className="text-[11px] font-mono text-neutral-500">
                    Channel: {sandboxChannel.toUpperCase()} · Status: 200 OK
                  </span>
                  <button
                    onClick={onEnterApp}
                    className="text-xs text-neutral-300 hover:text-[#B8FF00] transition-colors underline underline-offset-4"
                  >
                    View in Developer Inbox →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-800/80 px-6 lg:px-12 py-8 bg-neutral-950">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-3">
            <NotifyXLogo size="sm" onClick={onEnterApp} />
            <span>·</span>
            <span>Reliable notifications for modern applications.</span>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={onEnterApp} className="hover:text-[#B8FF00] transition-colors">
              Console
            </button>
            <button onClick={onNavigateLogin} className="hover:text-[#B8FF00] transition-colors">
              Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
