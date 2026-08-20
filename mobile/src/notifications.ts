import { LocalNotifications } from '@capacitor/local-notifications';
import { setNotificationPort, type NotificationPort } from '@/lib/notifications/runtime';
import type { ScheduledReminder } from '@/packages/product/shared/notifications/scheduler';

function scheduledDate(dayKey: string, localMinutes: number): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day, Math.floor(localMinutes / 60), localMinutes % 60, 0, 0);
}

const nativePort: NotificationPort = {
  async requestPermission() {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  },
  async cancel(ids) {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  },
  async schedule(reminders: ScheduledReminder[]) {
    const now = Date.now();
    const future = reminders
      .map((reminder) => ({ reminder, at: scheduledDate(reminder.dayKey, reminder.localMinutes) }))
      .filter(({ at }) => at.getTime() > now);
    if (future.length === 0) return;
    await LocalNotifications.schedule({
      notifications: future.map(({ reminder, at }) => ({
        id: reminder.id,
        title: reminder.title,
        body: reminder.body,
        schedule: { at, allowWhileIdle: true },
      })),
    });
  },
};

export function configureNativeNotifications(): void {
  setNotificationPort(nativePort);
}
