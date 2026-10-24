import type { ChannelName } from './types.ts';

/**
 * Priority-Aware Channel Selection Policy:
 *
 * Low:      In-App only
 * Normal:   In-App
 * High:     In-App + Email
 * Critical: In-App + Email + Push
 *
 * User preferences always act as the authoritative gatekeeper.
 */
export function selectCandidateChannels(
  priority: string = 'normal',
  requestedChannel?: string
): ChannelName[] {
  if (requestedChannel && ['in_app', 'email', 'push'].includes(requestedChannel.toLowerCase())) {
    return [requestedChannel.toLowerCase() as ChannelName];
  }

  const p = priority.toLowerCase();
  switch (p) {
    case 'critical':
      return ['in_app', 'email', 'push'];
    case 'high':
      return ['in_app', 'email'];
    case 'low':
      return ['in_app'];
    case 'normal':
    default:
      return ['in_app'];
  }
}
