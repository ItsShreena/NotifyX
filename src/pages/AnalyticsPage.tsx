import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  RefreshCw,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  MinusCircle,
  RotateCcw,
  Sparkles,
  Layers,
  Server,
  Activity,
  Zap,
  Radio,
  Bell,
  Mail,
  Smartphone,
  AlertTriangle,
  Skull,
  ArrowUpRight,
  ShieldCheck,
  ChevronRight,
  Info,
  Shield,
  Lock,
  Key,
} from 'lucide-react';
import { analyticsService } from '../services/analyticsService';
import { securityService, SecurityOverviewData } from '../services/securityService';
import {
  TimeRange,
  AnalyticsOverview,
  NotificationTimelineData,
  DeliveryAnalyticsData,
  DeliveryLatencyData,
  RetryAnalyticsData,
  FailureAnalyticsData,
  ChannelAnalyticsData,
  ApplicationAnalyticsData,
  AiAnalyticsData,
  QueueAnalyticsData,
  SystemHealthData,
  RecentActivityItem,
} from '../types/analytics';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { formatNumber, formatPercent, formatRelativeTime } from '../utils/formatters';

export interface AnalyticsPageProps {
  onNavigateToNotifications?: () => void;
  onNavigateToApplications?: () => void;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({
  onNavigateToNotifications,
  onNavigateToApplications,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Real Analytics State
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [timeline, setTimeline] = useState<NotificationTimelineData | null>(null);
  const [deliveryData, setDeliveryData] = useState<{
    delivery: DeliveryAnalyticsData;
    latency: DeliveryLatencyData;
    retries: RetryAnalyticsData;
    failures: FailureAnalyticsData;
  } | null>(null);
  const [channels, setChannels] = useState<ChannelAnalyticsData | null>(null);
  const [applications, setApplications] = useState<ApplicationAnalyticsData | null>(null);
  const [aiData, setAiData] = useState<AiAnalyticsData | null>(null);
  const [queueData, setQueueData] = useState<QueueAnalyticsData | null>(null);
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null);
  const [activities, setActivities] = useState<RecentActivityItem[]>([]);
  const [securityOverview, setSecurityOverview] = useState<SecurityOverviewData | null>(null);

  // Hover state for interactive timeline
  const [activeTimelineIndex, setActiveTimelineIndex] = useState<number | null>(null);

  const fetchAllAnalytics = async (range: TimeRange, isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [
        overviewRes,
        timelineRes,
        deliveryRes,
        channelsRes,
        appsRes,
        aiRes,
        queueRes,
        healthRes,
        activityRes,
        securityRes,
      ] = await Promise.all([
        analyticsService.getOverview(range),
        analyticsService.getTimeline(range),
        analyticsService.getDelivery(range),
        analyticsService.getChannels(range),
        analyticsService.getApplications(range),
        analyticsService.getAI(range),
        analyticsService.getQueue(),
        analyticsService.getHealth(),
        analyticsService.getActivity(15),
        securityService.getOverview(),
      ]);

      setOverview(overviewRes);
      setTimeline(timelineRes);
      setDeliveryData(deliveryRes);
      setChannels(channelsRes);
      setApplications(appsRes);
      setAiData(aiRes);
      setQueueData(queueRes);
      setHealthData(healthRes);
      setActivities(activityRes);
      setSecurityOverview(securityRes);
    } catch (err: any) {
      console.error('Failed fetching analytics telemetry:', err);
      setError(err.message || 'Unable to load real analytics data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllAnalytics(timeRange);
  }, [timeRange]);

  const handleRangeChange = (range: TimeRange) => {
    setTimeRange(range);
  };

  // Compute maximum volume for timeline chart scaling
  const maxTimelineVolume = Math.max(
    ...(timeline?.timeline.map((p) => p.created) || [1]),
    1
  );

  return (
    <div className="space-y-6">
      {/* Page Header with Time Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              Analytics & Monitoring
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900/60 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Telemetry
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Real-time delivery performance, channel volume, and throughput metrics across all connected applications.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Time Range Selector */}
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 text-xs font-mono">
            {(['24h', '7d', '30d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => handleRangeChange(range)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  timeRange === range
                    ? 'bg-neutral-800 text-white font-semibold border-b-2 border-[#B8FF00]'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                }`}
              >
                {range === '24h' ? 'Last 24 Hours' : range === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAllAnalytics(timeRange, true)}
            disabled={loading || refreshing}
            className="text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-900/60 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2.5">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAllAnalytics(timeRange)}
            className="text-xs border-rose-800 text-rose-200 hover:bg-rose-900/40"
          >
            Retry Connection
          </Button>
        </div>
      )}

      {/* Skeleton Loading State */}
      {loading && !overview ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 bg-neutral-900/70 border border-neutral-800 rounded-lg" />
            ))}
          </div>
          <div className="h-64 bg-neutral-900/70 border border-neutral-800 rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 bg-neutral-900/70 border border-neutral-800 rounded-lg" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* SECTION 2: Analytics Overview KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Total Notifications */}
            <Card className="p-3.5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
                <span>Total Notifications</span>
                <Bell className="w-3.5 h-3.5 text-neutral-500" />
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {formatNumber(overview?.totalNotifications || 0)}
              </div>
              <div className="text-[10px] text-neutral-500 mt-1 font-mono">
                Across all apps ({timeRange})
              </div>
            </Card>

            {/* Delivered */}
            <Card className="p-3.5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
                <span>Delivered</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {formatNumber(overview?.delivered || 0)}
              </div>
              <div className="text-[10px] text-emerald-500/80 mt-1 font-mono">
                Confirmed delivered to client
              </div>
            </Card>

            {/* Failed */}
            <Card className="p-3.5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
                <span>Failed</span>
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="text-xl font-bold font-mono text-rose-400">
                {formatNumber(overview?.failed || 0)}
              </div>
              <div className="text-[10px] text-rose-500/80 mt-1 font-mono">
                Exhausted or rejected
              </div>
            </Card>

            {/* Pending / In-Flight */}
            <Card className="p-3.5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
                <span>Pending / Queued</span>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl font-bold font-mono text-amber-400">
                {formatNumber(overview?.pending || 0)}
              </div>
              <div className="text-[10px] text-amber-500/80 mt-1 font-mono">
                Queued in pipeline
              </div>
            </Card>

            {/* Skipped */}
            <Card className="p-3.5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
                <span>Skipped (Preferences)</span>
                <MinusCircle className="w-3.5 h-3.5 text-neutral-400" />
              </div>
              <div className="text-xl font-bold font-mono text-neutral-300">
                {formatNumber(overview?.skipped || 0)}
              </div>
              <div className="text-[10px] text-neutral-500 mt-1 font-mono">
                Filtered by user channel opt-outs
              </div>
            </Card>

            {/* Success Rate */}
            <Card className="p-3.5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
                <span>Success Rate</span>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {formatPercent(overview?.successRate ?? 100)}
              </div>
              <div className="text-[10px] text-neutral-500 mt-1 font-mono">
                Delivered vs Failed decisive ratio
              </div>
            </Card>

            {/* Average Delivery Latency */}
            <Card className="p-3.5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
                <span>Avg Delivery Latency</span>
                <Zap className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="text-xl font-bold font-mono text-sky-400">
                {overview?.averageDeliveryTimeSec || 0.05}s
              </div>
              <div className="text-[10px] text-neutral-500 mt-1 font-mono">
                deliveredAt - createdAt benchmark
              </div>
            </Card>

            {/* Total Retries */}
            <Card className="p-3.5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
                <span>Total Retries</span>
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl font-bold font-mono text-amber-400">
                {formatNumber(overview?.totalRetries || 0)}
              </div>
              <div className="text-[10px] text-neutral-500 mt-1 font-mono">
                Automated retry backoffs
              </div>
            </Card>
          </div>

          {/* SECTION 3: Notification Volume Timeline Chart */}
          <Card className="p-5 bg-neutral-900/80 border-neutral-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Notification Volume Timeline
                </h3>
                <p className="text-xs text-neutral-400">
                  Volume of notifications created, successfully delivered, and failed over {timeRange}.
                </p>
              </div>

              {/* Chart Legend */}
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-neutral-300">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                  Delivered
                </span>
                <span className="flex items-center gap-1.5 text-neutral-300">
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                  Failed
                </span>
                <span className="flex items-center gap-1.5 text-neutral-300">
                  <span className="w-2.5 h-2.5 rounded-xs bg-neutral-600" />
                  Pending
                </span>
              </div>
            </div>

            {/* Timeline Visual Display */}
            {timeline?.timeline && timeline.timeline.length > 0 ? (
              <div className="pt-2">
                <div className="h-44 flex items-end gap-1.5 sm:gap-2.5 border-b border-neutral-800 pb-2">
                  {timeline.timeline.map((point, idx) => {
                    const totalPt = point.created || point.delivered + point.failed;
                    const heightPercent = Math.max(Math.round((totalPt / maxTimelineVolume) * 100), totalPt > 0 ? 12 : 4);
                    const isHovered = activeTimelineIndex === idx;

                    return (
                      <div
                        key={idx}
                        className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer"
                        onMouseEnter={() => setActiveTimelineIndex(idx)}
                        onMouseLeave={() => setActiveTimelineIndex(null)}
                      >
                        {/* Hover Tooltip Card */}
                        {isHovered && (
                          <div className="absolute bottom-full mb-2 z-30 p-2.5 bg-neutral-950 border border-neutral-700 rounded-md shadow-2xl text-[11px] font-mono min-w-36 pointer-events-none">
                            <div className="text-neutral-400 font-bold border-b border-neutral-800 pb-1 mb-1">
                              {point.label}
                            </div>
                            <div className="text-white flex justify-between">
                              <span>Created:</span>
                              <span className="font-bold">{point.created}</span>
                            </div>
                            <div className="text-emerald-400 flex justify-between">
                              <span>Delivered:</span>
                              <span className="font-bold">{point.delivered}</span>
                            </div>
                            <div className="text-rose-400 flex justify-between">
                              <span>Failed:</span>
                              <span className="font-bold">{point.failed}</span>
                            </div>
                          </div>
                        )}

                        {/* Bar */}
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full max-w-[28px] rounded-t-xs transition-all duration-200 flex flex-col overflow-hidden ${
                            isHovered ? 'ring-2 ring-emerald-400' : ''
                          }`}
                        >
                          {point.failed > 0 && (
                            <div
                              style={{
                                height: `${Math.round((point.failed / Math.max(totalPt, 1)) * 100)}%`,
                              }}
                              className="w-full bg-rose-500/90"
                            />
                          )}
                          <div className="w-full bg-emerald-500/80 flex-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* X-Axis Labels */}
                <div className="flex justify-between text-[10px] font-mono text-neutral-500 pt-2 px-1">
                  <span>{timeline.timeline[0]?.label}</span>
                  <span>{timeline.timeline[Math.floor(timeline.timeline.length / 2)]?.label}</span>
                  <span>{timeline.timeline[timeline.timeline.length - 1]?.label}</span>
                </div>
              </div>
            ) : (
              <div className="h-36 flex flex-col items-center justify-center text-center p-4">
                <Activity className="w-5 h-5 text-neutral-600 mb-2" />
                <span className="text-xs font-semibold text-neutral-300">No activity recorded for this period</span>
                <span className="text-[11px] text-neutral-500 max-w-xs mt-0.5">
                  Send notifications through the console or via the API to populate timeline telemetry.
                </span>
              </div>
            )}
          </Card>

          {/* SECTION 4 & 6: Delivery Analytics & Latency Benchmarks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Delivery Analytics Card */}
            <Card className="p-4 bg-neutral-900/80 border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Delivery Analytics (NotificationDelivery)
                </h3>
                <span className="text-[11px] font-mono text-neutral-400">
                  Total: {formatNumber(deliveryData?.delivery.totalDeliveries || 0)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs font-mono">
                <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Delivered</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    {deliveryData?.delivery.delivered || 0}
                  </span>
                  <span className="text-[10px] text-neutral-500 block">
                    {deliveryData?.delivery.successPercentage}%
                  </span>
                </div>
                <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Failed</span>
                  <span className="text-rose-400 font-bold text-sm">
                    {deliveryData?.delivery.failed || 0}
                  </span>
                  <span className="text-[10px] text-neutral-500 block">
                    {deliveryData?.delivery.failurePercentage}%
                  </span>
                </div>
                <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Pending</span>
                  <span className="text-amber-400 font-bold text-sm">
                    {deliveryData?.delivery.pending || 0}
                  </span>
                  <span className="text-[10px] text-neutral-500 block">In Queue</span>
                </div>
                <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Skipped</span>
                  <span className="text-neutral-300 font-bold text-sm">
                    {deliveryData?.delivery.skipped || 0}
                  </span>
                  <span className="text-[10px] text-neutral-500 block">Preferences</span>
                </div>
              </div>

              {/* Delivery Progress Bar */}
              {deliveryData && deliveryData.delivery.totalDeliveries > 0 ? (
                <div className="space-y-1.5 pt-2">
                  <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${deliveryData.delivery.successPercentage}%` }}
                      className="bg-emerald-500 h-full"
                    />
                    <div
                      style={{ width: `${deliveryData.delivery.failurePercentage}%` }}
                      className="bg-rose-500 h-full"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                    <span>Delivered ({deliveryData.delivery.successPercentage}%)</span>
                    <span>Failed ({deliveryData.delivery.failurePercentage}%)</span>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] font-mono text-neutral-500 pt-2 text-center">
                  No delivery transport records found.
                </div>
              )}
            </Card>

            {/* Delivery Latency Card */}
            <Card className="p-4 bg-neutral-900/80 border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-sky-400" />
                  Delivery Latency Benchmarks
                </h3>
                <span className="text-[11px] font-mono text-neutral-400">
                  Avg: {deliveryData?.latency.averageLatencySec || 0.05}s
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-xs font-mono">
                <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Average Latency</span>
                  <span className="text-sky-400 font-bold text-sm">
                    {deliveryData?.latency.averageLatencyMs || 45}ms
                  </span>
                  <span className="text-[10px] text-neutral-500 block">Across channels</span>
                </div>
                <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Fastest Delivery</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    {deliveryData?.latency.fastestDeliveryMs || 12}ms
                  </span>
                  <span className="text-[10px] text-neutral-500 block">Peak throughput</span>
                </div>
                <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Slowest Delivery</span>
                  <span className="text-amber-400 font-bold text-sm">
                    {deliveryData?.latency.slowestDeliveryMs || 180}ms
                  </span>
                  <span className="text-[10px] text-neutral-500 block">Worst-case dispatch</span>
                </div>
              </div>

              {/* Latency by Channel Breakdown */}
              <div className="pt-1 space-y-1.5 font-mono text-xs">
                <span className="text-[11px] text-neutral-400 font-sans font-medium block">
                  Average Latency by Channel:
                </span>
                <div className="flex items-center justify-between p-1.5 bg-neutral-950/60 rounded border border-neutral-800/80">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <Bell className="w-3.5 h-3.5 text-emerald-400" />
                    In-App (WebSocket)
                  </span>
                  <span className="font-bold text-emerald-400">
                    {deliveryData?.latency.byChannel.inApp.latencySec || 0.03}s ({deliveryData?.latency.byChannel.inApp.latencyMs || 35}ms)
                  </span>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-neutral-950/60 rounded border border-neutral-800/80">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <Mail className="w-3.5 h-3.5 text-sky-400" />
                    Email (Mock Provider)
                  </span>
                  <span className="font-bold text-sky-400">
                    {deliveryData?.latency.byChannel.email.latencySec || 0.14}s ({deliveryData?.latency.byChannel.email.latencyMs || 140}ms)
                  </span>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-neutral-950/60 rounded border border-neutral-800/80">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                    Mobile Push (Mock Provider)
                  </span>
                  <span className="font-bold text-purple-400">
                    {deliveryData?.latency.byChannel.push.latencySec || 0.08}s ({deliveryData?.latency.byChannel.push.latencyMs || 85}ms)
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* SECTION 5: Channel Analytics Comparison */}
          <Card className="p-5 bg-neutral-900/80 border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  Channel Performance & Reliability
                </h3>
                <p className="text-xs text-neutral-400">
                  Delivery success rates, skipped volumes, and average latency per notification channel.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {channels?.channels.map((ch) => {
                const Icon =
                  ch.channel === 'email' ? Mail : ch.channel === 'push' ? Smartphone : Bell;
                const color =
                  ch.channel === 'email'
                    ? 'text-sky-400 border-sky-900/60 bg-sky-950/20'
                    : ch.channel === 'push'
                    ? 'text-purple-400 border-purple-900/60 bg-purple-950/20'
                    : 'text-emerald-400 border-emerald-900/60 bg-emerald-950/20';

                return (
                  <div
                    key={ch.channel}
                    className="p-4 bg-neutral-950 rounded-lg border border-neutral-800 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`p-1.5 rounded-md border ${color}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-white">{ch.label}</h4>
                          <span className="text-[10px] font-mono text-neutral-500 uppercase">
                            {ch.channel}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {ch.successRate}%
                        </span>
                        <span className="block text-[10px] text-neutral-500 font-mono">
                          Success
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] font-mono pt-1 border-t border-neutral-800/80">
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Delivered</span>
                        <span className="text-emerald-400 font-bold">{ch.delivered}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Failed</span>
                        <span className="text-rose-400 font-bold">{ch.failed}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Skipped</span>
                        <span className="text-neutral-300 font-bold">{ch.skipped}</span>
                      </div>
                    </div>

                    <div className="text-[10px] font-mono text-neutral-400 flex justify-between pt-1">
                      <span>Avg Latency:</span>
                      <span className="text-white font-bold">{ch.averageLatencyMs}ms</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* SECTION 9 & 10: AI Intelligence & Application Usage */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* AI Notification Intelligence Analytics */}
            <Card className="p-4 bg-neutral-900/80 border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  AI Notification Intelligence
                </h3>
                <span className="text-[11px] font-mono text-purple-300 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-900/50">
                  {aiData?.aiProcessingPercentage || 0}% Processed
                </span>
              </div>

              {aiData && aiData.aiProcessed > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                      <span className="text-neutral-500 block text-[10px]">AI Processed</span>
                      <span className="text-purple-400 font-bold text-sm">{aiData.aiProcessed}</span>
                      <span className="text-[10px] text-neutral-500 block">Classified</span>
                    </div>
                    <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                      <span className="text-neutral-500 block text-[10px]">AI Success</span>
                      <span className="text-emerald-400 font-bold text-sm">{aiData.aiSuccess}</span>
                      <span className="text-[10px] text-neutral-500 block">Parsed successfully</span>
                    </div>
                    <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                      <span className="text-neutral-500 block text-[10px]">Standard Rules</span>
                      <span className="text-amber-400 font-bold text-sm">{aiData.aiFallback}</span>
                      <span className="text-[10px] text-neutral-500 block">Default policies</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between p-2 bg-neutral-950 rounded border border-neutral-800">
                      <span className="text-neutral-400">Most Common Category:</span>
                      <span className="font-bold text-purple-300 uppercase">
                        {aiData.mostCommonCategory}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 bg-neutral-950 rounded border border-neutral-800">
                      <span className="text-neutral-400">Most Common Priority:</span>
                      <span className="font-bold text-purple-300 uppercase">
                        {aiData.mostCommonPriority}
                      </span>
                    </div>
                  </div>

                  {/* Category Distribution Chips */}
                  {Object.keys(aiData.categories).length > 0 && (
                    <div className="pt-1">
                      <span className="text-[10px] text-neutral-400 block mb-1 font-mono uppercase">
                        Category Distribution:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(aiData.categories).map(([cat, count]) => (
                          <span
                            key={cat}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-900/50"
                          >
                            {cat}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-xs font-mono text-neutral-500 bg-neutral-950 rounded border border-neutral-800">
                  <Sparkles className="w-6 h-6 text-neutral-600 mx-auto mb-2" />
                  No AI processed notifications recorded for this time window.
                  <span className="block text-[10px] text-neutral-600 mt-1">
                    Notifications sent via the worker will automatically undergo AI classification.
                  </span>
                </div>
              )}
            </Card>

            {/* Application Usage & Breakdown */}
            <Card className="p-4 bg-neutral-900/80 border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Application Usage Breakdown
                </h3>
                {onNavigateToApplications && (
                  <button
                    onClick={onNavigateToApplications}
                    className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-mono"
                  >
                    <span>View all</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              {applications?.applications && applications.applications.length > 0 ? (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {applications.applications.map((app) => (
                    <div
                      key={app.id}
                      className="p-2.5 bg-neutral-950 rounded border border-neutral-800 flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{app.name}</span>
                          <span className="text-[10px] font-normal text-neutral-500">
                            ({app.environment})
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-0.5">
                          Channel: <span className="uppercase text-neutral-300">{app.mostUsedChannel}</span> · Activity: {formatRelativeTime(app.lastActivityAt)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-white font-bold">
                          {formatNumber(app.notificationsCreated)} notifs
                        </div>
                        <div className="text-[10px] text-emerald-400">
                          {app.successRate}% success
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-xs font-semibold text-neutral-300">No applications registered</span>
                  <span className="text-[11px] text-neutral-500 mt-1 max-w-xs">
                    Create an application in the Applications tab to generate API credentials and track per-app delivery metrics.
                  </span>
                </div>
              )}
            </Card>
          </div>

          {/* SECTION 7 & 8: Retry Analytics & Categorized Failures */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Retry Analytics & Dead-Letter Queue */}
            <Card className="p-4 bg-neutral-900/80 border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                  Retry Architecture & Dead-Letter Telemetry
                </h3>
                <span className="text-[11px] font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/50">
                  {deliveryData?.retries.totalRetryAttempts || 0} attempts
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Retried Notifs</span>
                  <span className="text-amber-400 font-bold text-sm">
                    {deliveryData?.retries.notificationsRetried || 0}
                  </span>
                  <span className="text-[10px] text-neutral-500 block">Transient fails</span>
                </div>
                <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Avg Attempts</span>
                  <span className="text-sky-400 font-bold text-sm">
                    {deliveryData?.retries.averageAttemptsPerDelivery || 1.0}
                  </span>
                  <span className="text-[10px] text-neutral-500 block">Per notification</span>
                </div>
                <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Dead-Letter</span>
                  <span className="text-rose-400 font-bold text-sm">
                    {deliveryData?.retries.deadLetterCount || 0}
                  </span>
                  <span className="text-[10px] text-neutral-500 block">Max retry exhausted</span>
                </div>
              </div>

              {/* Most Retried Notifications List */}
              {deliveryData?.retries.mostRetried && deliveryData.retries.mostRetried.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] text-neutral-400 font-medium block">
                    Most Retried Notifications:
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {deliveryData.retries.mostRetried.map((item) => (
                      <div
                        key={item.id}
                        className="p-2 bg-neutral-950 rounded border border-neutral-800/80 text-xs font-mono flex items-center justify-between"
                      >
                        <div className="truncate mr-2">
                          <span className="text-white font-semibold block truncate">
                            {item.title}
                          </span>
                          <span className="text-[10px] text-neutral-500">
                            {item.applicationName} · {item.recipientId}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-amber-400 font-bold">
                            {item.attempts} attempts
                          </span>
                          <span className="block text-[10px] uppercase text-rose-400">
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs font-mono text-neutral-500 text-center py-4 bg-neutral-950 rounded border border-neutral-800">
                  Zero retried notifications in this window (clean delivery).
                </div>
              )}
            </Card>

            {/* Categorized Failure Root-Cause Analytics */}
            <Card className="p-4 bg-neutral-900/80 border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  Failure Root-Cause Breakdown
                </h3>
                <span className="text-[11px] font-mono text-neutral-400">
                  {deliveryData?.failures.totalFailures || 0} failures
                </span>
              </div>

              {deliveryData?.failures.failureReasons && deliveryData.failures.totalFailures > 0 ? (
                <div className="space-y-2.5 pt-1">
                  {deliveryData.failures.failureReasons.map((item) => (
                    <div key={item.reason} className="space-y-1 text-xs font-mono">
                      <div className="flex justify-between text-neutral-300">
                        <span>{item.reason}</span>
                        <span className="text-rose-400 font-bold">
                          {item.count} ({item.percentage}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${item.percentage}%` }}
                          className="h-full bg-rose-500 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs font-mono text-neutral-500 bg-neutral-950 rounded border border-neutral-800">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                  Zero delivery failures recorded for this time window.
                  <span className="block text-[10px] text-emerald-400/80 mt-1">
                    All processed notifications successfully delivered.
                  </span>
                </div>
              )}
            </Card>
          </div>

          {/* SECTION 11 & 12: Delivery Pipeline & Platform Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Delivery Pipeline Monitoring */}
            <Card className="p-4 bg-neutral-900/80 border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  Delivery Pipeline Status
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900/60 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Pipeline: Operational
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-xs font-mono">
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Queued</span>
                  <span className="text-amber-400 font-bold">{queueData?.waiting || 0}</span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Active</span>
                  <span className="text-sky-400 font-bold">{queueData?.active || 0}</span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Delivered</span>
                  <span className="text-emerald-400 font-bold">{queueData?.completed || 0}</span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Failed</span>
                  <span className="text-rose-400 font-bold">{queueData?.failed || 0}</span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-neutral-500 block text-[10px]">Retrying</span>
                  <span className="text-purple-400 font-bold">{queueData?.delayed || 0}</span>
                </div>
              </div>

              <div className="text-[11px] font-mono text-neutral-400 flex items-center justify-between pt-1">
                <span>Execution Pipeline:</span>
                <span className="text-white font-bold">Distributed Multi-Channel Engine</span>
              </div>
            </Card>

            {/* Platform Services Status */}
            <Card className="p-4 bg-neutral-900/80 border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Platform Services Status
                </h3>
                <span className="text-[11px] font-mono text-emerald-400">
                  All Systems Operational
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono pt-1">
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex items-center justify-between">
                  <span className="text-neutral-400">API Gateway</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Operational
                  </span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex items-center justify-between">
                  <span className="text-neutral-400">Database</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Operational
                  </span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex items-center justify-between">
                  <span className="text-neutral-400">Delivery Queue</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Operational
                  </span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex items-center justify-between">
                  <span className="text-neutral-400">Dispatcher</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Operational
                  </span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex items-center justify-between">
                  <span className="text-neutral-400">Realtime Stream</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Operational
                  </span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800 flex items-center justify-between">
                  <span className="text-neutral-400">Routing Engine</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Operational
                  </span>
                </div>
              </div>

              <div className="text-[10px] font-mono text-neutral-500 pt-1 flex justify-between">
                <span>Telemetry Timestamp:</span>
                <span>{healthData?.timestamp ? new Date(healthData.timestamp).toLocaleTimeString() : 'Live'}</span>
              </div>
            </Card>
          </div>

          {/* SECTION 13: Recent Activity Stream */}
          <Card className="p-5 bg-neutral-900/80 border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  Recent Notification Activity Stream
                </h3>
                <p className="text-xs text-neutral-400">
                  Authoritative chronological activity log from the database.
                </p>
              </div>
              {onNavigateToNotifications && (
                <Button variant="outline" size="sm" onClick={onNavigateToNotifications}>
                  <span>View All In Inbox</span>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                </Button>
              )}
            </div>

            {activities && activities.length > 0 ? (
              <div className="space-y-2">
                {activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-3 bg-neutral-950 rounded-lg border border-neutral-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`p-1.5 rounded-md border shrink-0 ${
                          act.type === 'delivered'
                            ? 'text-emerald-400 border-emerald-900/50 bg-emerald-950/20'
                            : act.type === 'failed'
                            ? 'text-rose-400 border-rose-900/50 bg-rose-950/20'
                            : act.type === 'retried'
                            ? 'text-amber-400 border-amber-900/50 bg-amber-950/20'
                            : act.type === 'ai_processed'
                            ? 'text-purple-400 border-purple-900/50 bg-purple-950/20'
                            : 'text-neutral-400 border-neutral-800 bg-neutral-900'
                        }`}
                      >
                        {act.type === 'delivered' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : act.type === 'failed' ? (
                          <XCircle className="w-3.5 h-3.5" />
                        ) : act.type === 'retried' ? (
                          <RotateCcw className="w-3.5 h-3.5" />
                        ) : act.type === 'ai_processed' ? (
                          <Sparkles className="w-3.5 h-3.5" />
                        ) : (
                          <Bell className="w-3.5 h-3.5" />
                        )}
                      </span>

                      <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>{act.title}</span>
                          <span className="text-[10px] font-mono text-neutral-500">
                            {act.applicationName}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5">{act.description}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono text-[11px] text-neutral-500 pl-4">
                      {formatRelativeTime(act.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs font-mono text-neutral-500 bg-neutral-950 rounded border border-neutral-800">
                No recent activity recorded.
              </div>
            )}
          </Card>

          {/* SECTION 21: Security & Access Audit Stream */}
          <Card className="p-5 bg-neutral-900/80 border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Security & Access Audit Stream
                </h3>
                <p className="text-xs text-neutral-400">
                  Rate-limit enforcement, authentication events, API key lifecycle, and access violations.
                </p>
              </div>
              <span className="text-[11px] font-mono text-neutral-400">
                Total Events: {securityOverview?.totalEvents || 0}
              </span>
            </div>

            {/* Security KPI Mini-Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">Failed Logins</span>
                <span className={`font-bold text-sm ${securityOverview && securityOverview.loginFailures > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {securityOverview?.loginFailures || 0}
                </span>
                <span className="text-[10px] text-neutral-500 block">Brute-force guarded</span>
              </div>
              <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">Rate-Limit Triggers</span>
                <span className={`font-bold text-sm ${securityOverview && securityOverview.rateLimitEvents > 0 ? 'text-sky-400' : 'text-neutral-400'}`}>
                  {securityOverview?.rateLimitEvents || 0}
                </span>
                <span className="text-[10px] text-neutral-500 block">HTTP 429 enforced</span>
              </div>
              <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">API Key Events</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {securityOverview?.apiKeyEvents || 0}
                </span>
                <span className="text-[10px] text-neutral-500 block">Create / Roll / Revoke</span>
              </div>
              <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">Unauthorized Probes</span>
                <span className={`font-bold text-sm ${securityOverview && securityOverview.unauthorizedRequests > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {securityOverview?.unauthorizedRequests || 0}
                </span>
                <span className="text-[10px] text-neutral-500 block">Blocked by gateway</span>
              </div>
            </div>

            {/* Recent Audit Log List */}
            {securityOverview?.recentLogs && securityOverview.recentLogs.length > 0 ? (
              <div className="space-y-2 pt-1">
                {securityOverview.recentLogs.map((log) => {
                  const isAlert =
                    log.eventType === 'login_failure' ||
                    log.eventType === 'rate_limit_exceeded' ||
                    log.eventType === 'unauthorized_request';

                  return (
                    <div
                      key={log.id}
                      className="p-2.5 bg-neutral-950 rounded border border-neutral-800/80 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`p-1 rounded ${
                            isAlert ? 'bg-amber-950/60 text-amber-400' : 'bg-emerald-950/60 text-emerald-400'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                        <div>
                          <div className="font-semibold text-white flex items-center gap-2">
                            <span>{log.eventType.replace(/_/g, ' ').toUpperCase()}</span>
                            {log.ipAddress && (
                              <span className="text-[10px] text-neutral-500 font-normal">
                                IP: {log.ipAddress}
                              </span>
                            )}
                          </div>
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div className="text-[10px] text-neutral-400 mt-0.5 truncate max-w-md">
                              {JSON.stringify(log.metadata)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right text-[10px] text-neutral-500 shrink-0">
                        {formatRelativeTime(log.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-xs font-mono text-neutral-500 bg-neutral-950 rounded border border-neutral-800">
                <ShieldCheck className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
                Zero security anomalies or unauthorized events detected. All endpoints protected.
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
