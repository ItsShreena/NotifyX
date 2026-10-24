/**
 * Formats a number with comma separators and tabular display.
 * e.g. 1489204 -> "1,489,204"
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Formats a compact number representation.
 * e.g. 1489204 -> "1.49M", 48200 -> "48.2K"
 */
export function formatCompactNumber(num: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(num);
}

/**
 * Formats a percentage.
 * e.g. 74.2 -> "74.2%"
 */
export function formatPercent(num: number): string {
  return `${num.toFixed(1)}%`;
}

/**
 * Formats ISO date string into human readable time.
 * e.g. "2026-10-02T23:42:00Z" -> "Oct 2, 2026, 11:42 PM"
 */
export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return isoString;
  }
}

/**
 * Formats ISO date string into relative time.
 * e.g. "12m ago", "2h ago", "yesterday"
 */
export function formatRelativeTime(isoString: string): string {
  try {
    const now = new Date('2026-10-02T23:55:00Z').getTime(); // Reference point aligned with current environment
    const past = new Date(isoString).getTime();
    const diffSec = Math.max(0, Math.floor((now - past) / 1000));

    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDays = Math.floor(diffHour / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return formatDateTime(isoString);
  } catch {
    return isoString;
  }
}
