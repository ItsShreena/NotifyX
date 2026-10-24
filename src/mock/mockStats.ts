import { DashboardStats } from '../types/stats';

export const INITIAL_MOCK_STATS: DashboardStats = {
  totalNotifications: 1489204,
  delivered: 1472810,
  failed: 9414,
  pending: 6980,
  readRate: 74.2,
  activeApplicationsCount: 6,
  deliveryActivity: [
    { time: '00:00', delivered: 34200, failed: 210, pending: 140 },
    { time: '02:00', delivered: 28900, failed: 180, pending: 95 },
    { time: '04:00', delivered: 21400, failed: 120, pending: 80 },
    { time: '06:00', delivered: 42100, failed: 290, pending: 210 },
    { time: '08:00', delivered: 98400, failed: 640, pending: 490 },
    { time: '10:00', delivered: 142000, failed: 890, pending: 650 },
    { time: '12:00', delivered: 168900, failed: 1100, pending: 820 },
    { time: '14:00', delivered: 189200, failed: 1250, pending: 940 },
    { time: '16:00', delivered: 210400, failed: 1420, pending: 1120 },
    { time: '18:00', delivered: 194800, failed: 1190, pending: 890 },
    { time: '20:00', delivered: 182100, failed: 1104, pending: 790 },
    { time: '22:00', delivered: 160310, failed: 1020, pending: 745 },
  ],
  channelBreakdown: [
    { channel: 'in_app', label: 'In-App Inbox', count: 624100, percentage: 41.9 },
    { channel: 'email', label: 'Email (SMTP/API)', count: 489300, percentage: 32.8 },
    { channel: 'webhook', label: 'Webhooks', count: 212400, percentage: 14.3 },
    { channel: 'sms', label: 'SMS Gateway', count: 114204, percentage: 7.7 },
    { channel: 'push', label: 'Mobile Push', count: 49200, percentage: 3.3 },
  ],
};
