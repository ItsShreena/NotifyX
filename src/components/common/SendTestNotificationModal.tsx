import React, { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Application, DeliveryChannel } from '../../types/application';
import { NotificationPriority, NotificationType } from '../../types/notification';
import { notificationService } from '../../services/notificationService';
import { logService } from '../../services/logService';

export interface SendTestNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  applications: Application[];
  onNotificationSent?: () => void;
}

export const SendTestNotificationModal: React.FC<SendTestNotificationModalProps> = ({
  isOpen,
  onClose,
  applications,
  onNotificationSent,
}) => {
  const [selectedAppId, setSelectedAppId] = useState<string>(
    applications[0]?.id || 'app_apex_ecom'
  );
  const [recipientId, setRecipientId] = useState<string>('usr_alex_842');
  const [channel, setChannel] = useState<DeliveryChannel>('in_app');
  const [type, setType] = useState<NotificationType>('transactional');
  const [priority, setPriority] = useState<NotificationPriority>('normal');
  const [title, setTitle] = useState<string>('Order #4821 has been shipped');
  const [message, setMessage] = useState<string>(
    'Your package has been picked up by the carrier and is en route.'
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    setIsSubmitting(true);
    try {
      const selectedApp = applications.find((a) => a.id === selectedAppId);
      const appName = selectedApp ? selectedApp.name : 'Custom App';

      const notif = await notificationService.sendNotification(
        {
          applicationId: selectedAppId,
          recipientId,
          title,
          message,
          type,
          priority,
          channel,
        },
        appName
      );

      // Also append to audit log for full observability
      await logService.appendLog({
        id: `log_${Date.now()}`,
        eventId: `evt_sim_${Date.now().toString().slice(-6)}`,
        eventName: `${type}.${title.toLowerCase().replace(/\s+/g, '_').slice(0, 15)}`,
        applicationId: selectedAppId,
        applicationName: appName,
        recipient: recipientId,
        channel,
        status: 'delivered',
        statusCode: 200,
        attempts: 1,
        maxAttempts: 3,
        latencyMs: Math.floor(Math.random() * 80) + 25,
        timestamp: new Date().toISOString(),
        payload: {
          notificationId: notif.id,
          title,
          message,
          type,
        },
        headers: {
          'content-type': 'application/json',
          'x-notifyx-source': 'developer-console-tester',
        },
        responseBody: '{"delivered":true,"dispatchedVia":"NotifyX-Pipeline"}',
      });

      setSuccess(true);
      if (onNotificationSent) {
        onNotificationSent();
      }

      setTimeout(() => {
        setSuccess(false);
        setIsSubmitting(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to send test notification:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Dispatch Test Notification"
      description="Simulate an external application sending an event payload into the NotifyX pipeline."
      maxWidth="lg"
    >
      {success ? (
        <div className="py-8 flex flex-col items-center justify-center text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2 animate-bounce" />
          <h4 className="text-sm font-semibold text-neutral-100">Dispatched Successfully</h4>
          <p className="text-xs text-neutral-400 mt-1">
            Notification routed to inbox and registered in delivery logs.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Source Application
              </label>
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              >
                {applications.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name} ({app.environment})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Target Recipient ID
              </label>
              <input
                type="text"
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                placeholder="usr_123 or email@domain.com"
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as DeliveryChannel)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-2.5 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              >
                <option value="in_app">In-App Inbox</option>
                <option value="email">Email</option>
                <option value="push">Push</option>
                <option value="multi_channel">Multi-Channel (Priority Policy)</option>
                <option value="sms">SMS</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as NotificationType)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-2.5 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              >
                <option value="transactional">Transactional</option>
                <option value="alert">Alert</option>
                <option value="system">System</option>
                <option value="marketing">Marketing</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as NotificationPriority)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-2.5 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Notification Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Order #4821 has been shipped"
              className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Message Body</label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Notification body content..."
              className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600 resize-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Routing Event...' : 'Send Event'}</span>
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
