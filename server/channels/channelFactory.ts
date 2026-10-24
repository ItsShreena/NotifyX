import type { NotificationChannel, ChannelName } from './types.ts';
import { InAppChannel } from './inAppChannel.ts';
import { EmailChannel } from './emailChannel.ts';
import { PushChannel } from './pushChannel.ts';

/**
 * Channel Factory:
 * Central registry and factory for all notification channels.
 * Cleanly separates transport mechanics from core notification business logic.
 */
export class ChannelFactory {
  private channels: Map<ChannelName, NotificationChannel> = new Map();

  constructor() {
    this.registerChannel(new InAppChannel());
    this.registerChannel(new EmailChannel());
    this.registerChannel(new PushChannel());
  }

  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.name, channel);
  }

  getChannel(name: string): NotificationChannel {
    const normalized = name.toLowerCase() as ChannelName;
    const channel = this.channels.get(normalized);
    if (!channel) {
      throw new Error(`Unsupported notification channel: "${name}". Registered channels: ${Array.from(this.channels.keys()).join(', ')}`);
    }
    return channel;
  }

  hasChannel(name: string): boolean {
    return this.channels.has(name.toLowerCase() as ChannelName);
  }

  getSupportedChannels(): ChannelName[] {
    return Array.from(this.channels.keys());
  }
}

export const channelFactory = new ChannelFactory();
