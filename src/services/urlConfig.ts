/**
 * Centralized URL resolution for NotifyX.
 *
 * Ensures consistent behavior across local development, Google AI Studio Preview,
 * Docker containers, and production deployments.
 *
 * Prevents:
 * 1. Hardcoded localhost/127.0.0.1 leakage when accessed from remote browsers/iframes.
 * 2. Mixed-content security blocks (HTTPS attempting to fetch insecure HTTP/WS).
 * 3. Exposure of authentication credentials in URL query strings.
 */

export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

  if (!envUrl) {
    return '';
  }

  if (typeof window !== 'undefined') {
    const isCurrentHostLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    // If VITE_API_URL specifies localhost/127.0.0.1 but the browser is on a remote host (e.g. AI Studio Preview),
    // fallback to relative same-origin to prevent ERR_CONNECTION_REFUSED & Mixed Content blocks.
    const isEnvLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(envUrl);
    if (isEnvLocal && !isCurrentHostLocal) {
      return '';
    }

    // Guard against HTTP on HTTPS pages
    if (
      window.location.protocol === 'https:' &&
      envUrl.startsWith('http://') &&
      !isEnvLocal
    ) {
      return envUrl.replace(/^http:/, 'https:');
    }
  }

  return envUrl;
}

export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3000/ws';
  }

  const explicitWs = (import.meta.env.VITE_WS_URL || '').trim().replace(/\/+$/, '');
  const isCurrentHostLocal =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (explicitWs) {
    const isExplicitLocal = /^(wss?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(explicitWs);
    if (!isExplicitLocal || isCurrentHostLocal) {
      const secureWs =
        window.location.protocol === 'https:'
          ? explicitWs.replace(/^ws:/, 'wss:')
          : explicitWs;
      return `${secureWs}/ws`;
    }
  }

  const apiBase = getApiBaseUrl();
  if (apiBase && apiBase.startsWith('http')) {
    const wsBase = apiBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    const secureWs =
      window.location.protocol === 'https:'
        ? wsBase.replace(/^ws:/, 'wss:')
        : wsBase;
    return `${secureWs}/ws`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
