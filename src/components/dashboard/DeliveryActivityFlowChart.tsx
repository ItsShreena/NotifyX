import React, { useState, useId, useRef } from 'react';
import { ActivityDataPoint } from '../../types/stats';
import { Activity, Bell, AlertTriangle, ArrowUpRight } from 'lucide-react';

interface DeliveryActivityFlowChartProps {
  data: ActivityDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSendTest?: () => void;
}

export const DeliveryActivityFlowChart: React.FC<DeliveryActivityFlowChartProps> = ({
  data = [],
  loading = false,
  error = null,
  onRetry,
  onSendTest,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gradientId = useId();

  // Loading state
  if (loading) {
    return (
      <div className="h-64 flex flex-col justify-between p-4 bg-neutral-900/40 rounded-lg border border-neutral-800 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-4 bg-neutral-800 rounded w-36" />
            <div className="h-3 bg-neutral-850 rounded w-56" />
          </div>
          <div className="h-4 bg-neutral-800 rounded w-28" />
        </div>
        <div className="h-36 bg-neutral-850/60 rounded flex items-end p-4 gap-4">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-neutral-800/40 rounded-t"
              style={{ height: `${20 + ((i * 17) % 60)}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between">
          <div className="h-3 bg-neutral-850 rounded w-16" />
          <div className="h-3 bg-neutral-850 rounded w-16" />
          <div className="h-3 bg-neutral-850 rounded w-16" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-64 flex flex-col items-center justify-center p-6 text-center bg-neutral-900/30 rounded-lg border border-neutral-800">
        <AlertTriangle className="w-6 h-6 text-amber-400 mb-2" />
        <h3 className="text-sm font-semibold text-neutral-200">Unable to load delivery activity</h3>
        <p className="text-xs text-neutral-400 mt-1 max-w-sm">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 px-3 py-1.5 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // Empty state: when there is zero data or all points sum to 0
  const totalVolume = data.reduce(
    (acc, pt) => acc + (pt.total ?? pt.delivered + pt.failed + pt.pending),
    0
  );

  const totalDelivered = data.reduce((acc, pt) => acc + pt.delivered, 0);
  const totalFailed = data.reduce((acc, pt) => acc + pt.failed, 0);

  // SVG Chart Dimensions
  const svgWidth = 800;
  const svgHeight = 200;
  const padding = { top: 20, right: 30, bottom: 30, left: 45 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Calculate scales
  const maxRawValue = Math.max(
    ...data.map((pt) => pt.total ?? pt.delivered + pt.failed + pt.pending),
    0
  );
  // Round up max value for clean grid lines
  const maxValue = maxRawValue > 0 ? Math.ceil(maxRawValue * 1.15) : 5;

  const pointsCount = Math.max(data.length, 1);
  const getX = (idx: number) => {
    if (pointsCount <= 1) return padding.left + chartWidth / 2;
    return padding.left + (idx / (pointsCount - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    const clamped = Math.max(0, Math.min(val, maxValue));
    return padding.top + chartHeight - (clamped / maxValue) * chartHeight;
  };

  // Generate smooth cubic bezier curve
  const points = data.map((pt, idx) => ({
    x: getX(idx),
    y: getY(pt.total ?? pt.delivered + pt.failed + pt.pending),
    data: pt,
  }));

  const buildSmoothPath = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const dx = p1.x - p0.x;
      const cp1x = p0.x + dx * 0.45;
      const cp1y = p0.y;
      const cp2x = p1.x - dx * 0.45;
      const cp2y = p1.y;
      path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    }
    return path;
  };

  const linePath = buildSmoothPath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const bottomY = padding.top + chartHeight;
  const areaPath =
    points.length > 1
      ? `${linePath} L ${lastPoint.x} ${bottomY} L ${firstPoint.x} ${bottomY} Z`
      : '';

  // Generate 4 horizontal grid levels
  const gridLevels = [0, 0.33, 0.66, 1].map((pct) => ({
    val: Math.round(maxValue * pct),
    y: padding.top + chartHeight - pct * chartHeight,
  }));

  // Handle pointer tracking for responsive tooltips
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const normalizedX = (mouseX / rect.width) * svgWidth;

    // Find nearest point
    let nearestIdx = 0;
    let minDiff = Infinity;
    points.forEach((pt, idx) => {
      const diff = Math.abs(pt.x - normalizedX);
      if (diff < minDiff) {
        minDiff = diff;
        nearestIdx = idx;
      }
    });

    setHoverIndex(nearestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  return (
    <div className="relative">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-200">Delivery activity</h2>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#B8FF00]/10 text-[#B8FF00] border border-[#B8FF00]/20">
              24h flow
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Notification volume over the last 24 hours in 2-hour intervals.
          </p>
        </div>

        {/* Dynamic Metric Badges */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#B8FF00]" />
            <span className="text-neutral-400">Total:</span>
            <span className="text-white font-bold">{totalVolume.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-neutral-400">Delivered:</span>
            <span className="text-emerald-400 font-bold">{totalDelivered.toLocaleString()}</span>
          </div>
          {totalFailed > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-neutral-400">Failed:</span>
              <span className="text-rose-400 font-bold">{totalFailed.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* SVG Interactive Wave Flow Container */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden select-none bg-neutral-950/40 rounded-lg border border-neutral-800/80 p-2 sm:p-4"
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-48 sm:h-56 overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          role="img"
          aria-label="24-hour notification delivery activity flow chart"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B8FF00" stopOpacity="0.22" />
              <stop offset="50%" stopColor="#B8FF00" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#B8FF00" stopOpacity="0.00" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#B8FF00" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Understated Horizontal Gridlines */}
          {gridLevels.map((lvl, idx) => (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={lvl.y}
                x2={svgWidth - padding.right}
                y2={lvl.y}
                stroke="rgba(255, 255, 255, 0.05)"
                strokeDasharray={idx === 0 ? undefined : '3 3'}
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={lvl.y + 3.5}
                textAnchor="end"
                className="text-[10px] font-mono fill-neutral-500 select-none"
              >
                {lvl.val}
              </text>
            </g>
          ))}

          {/* Subtle Area Flow Fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill={`url(#${gradientId})`}
              className="transition-opacity duration-300 pointer-events-none"
            />
          )}

          {/* Electric Lime Wavy Stroke Line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#B8FF00"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
              className="transition-all duration-300 pointer-events-none"
            />
          )}

          {/* Data Points / Pulsing Nodes */}
          {points.map((pt, idx) => {
            const isHovered = hoverIndex === idx;
            const hasActivity = (pt.data.total ?? pt.data.delivered + pt.data.failed) > 0;

            return (
              <circle
                key={idx}
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 5.5 : hasActivity ? 3.5 : 2}
                fill={isHovered ? '#B8FF00' : hasActivity ? '#B8FF00' : '#404040'}
                stroke="#0f0f0f"
                strokeWidth={isHovered ? 2.5 : 1.5}
                className="transition-all duration-150 cursor-pointer"
              />
            );
          })}

          {/* Active Hover Crosshair Hairline */}
          {activePoint && (
            <g className="pointer-events-none transition-all duration-75">
              <line
                x1={activePoint.x}
                y1={padding.top}
                x2={activePoint.x}
                y2={bottomY}
                stroke="rgba(184, 255, 0, 0.45)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="6.5"
                fill="#B8FF00"
                stroke="#0a0a0a"
                strokeWidth="3"
              />
            </g>
          )}

          {/* X-Axis Time Labels (Shows every 2nd or 3rd label on small screens, all on desktop) */}
          {points.map((pt, idx) => {
            // Sample labels so they do not overlap
            const isMajor = idx % 2 === 0 || idx === points.length - 1;
            if (!isMajor) return null;

            return (
              <text
                key={idx}
                x={pt.x}
                y={bottomY + 18}
                textAnchor="middle"
                className={`text-[10px] font-mono select-none transition-colors ${
                  hoverIndex === idx ? 'fill-[#B8FF00] font-semibold' : 'fill-neutral-500'
                }`}
              >
                {pt.data.time}
              </text>
            );
          })}
        </svg>

        {/* Hover Tooltip Card */}
        {activePoint && (
          <div
            className="absolute z-20 pointer-events-none transform -translate-x-1/2 transition-transform duration-75"
            style={{
              left: `${(activePoint.x / svgWidth) * 100}%`,
              top: `${Math.max(12, (activePoint.y / svgHeight) * 100 - 36)}%`,
            }}
          >
            <div className="bg-neutral-950/95 border border-neutral-700/80 px-3 py-2 rounded-md shadow-2xl backdrop-blur-md text-[11px] font-mono min-w-[170px] whitespace-nowrap">
              <div className="text-neutral-400 font-semibold border-b border-neutral-800/80 pb-1 mb-1.5 flex items-center justify-between">
                <span>{activePoint.data.interval || activePoint.data.time}</span>
                <span className="text-[10px] text-neutral-500">2h window</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-neutral-200">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B8FF00]" />
                    Total volume:
                  </span>
                  <span className="font-bold text-white">
                    {(activePoint.data.total ?? activePoint.data.delivered + activePoint.data.failed + activePoint.data.pending).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Delivered:
                  </span>
                  <span className="font-bold">{activePoint.data.delivered.toLocaleString()}</span>
                </div>
                {activePoint.data.failed > 0 && (
                  <div className="flex items-center justify-between text-rose-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Failed:
                    </span>
                    <span className="font-bold">{activePoint.data.failed.toLocaleString()}</span>
                  </div>
                )}
                {activePoint.data.pending > 0 && (
                  <div className="flex items-center justify-between text-amber-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Queued:
                    </span>
                    <span className="font-bold">{activePoint.data.pending.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty State Overlay if 0 total activity */}
        {totalVolume === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/70 backdrop-blur-[2px] rounded-lg p-6 text-center">
            <div className="p-2.5 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 mb-2">
              <Activity className="w-4 h-4 text-[#B8FF00]" />
            </div>
            <h3 className="text-xs font-semibold text-neutral-200">No activity in the last 24 hours</h3>
            <p className="text-[11px] text-neutral-400 mt-0.5 max-w-xs">
              Dispatch a test notification or trigger an API request to see real-time delivery activity flow.
            </p>
            {onSendTest && (
              <button
                onClick={onSendTest}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-black bg-[#B8FF00] hover:bg-[#a3e600] rounded transition-colors"
              >
                <span>Send test notification</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chart Footer Subtitle */}
      <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono pt-3 px-1">
        <span>Discrete 2-hour interval timeline</span>
        <span className="text-neutral-400">Real-time telemetry</span>
      </div>
    </div>
  );
};
