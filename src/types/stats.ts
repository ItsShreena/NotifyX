import { DeliveryChannel } from './application';

export interface ActivityDataPoint {
  time: string; // e.g. "14:00" or "02:00 PM"
  interval?: string; // e.g. "12:00 PM – 02:00 PM"
  delivered: number;
  failed: number;
  pending: number;
  total?: number;
}

export interface ChannelStats {
  channel: DeliveryChannel;
  label: string;
  count: number;
  percentage: number;
}

export interface DashboardStats {
  totalNotifications: number;
  delivered: number;
  failed: number;
  pending: number;
  readRate: number; // percentage, e.g. 74.2
  activeApplicationsCount: number;
  deliveryActivity: ActivityDataPoint[];
  channelBreakdown: ChannelStats[];
}
