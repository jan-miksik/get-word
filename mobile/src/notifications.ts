import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { setNotificationPort, type NotificationPort } from '@/lib/notifications/runtime';
import {
  REMINDER_ID_END,
  REMINDER_ID_START,
  type ScheduledReminder,
} from '@/packages/product/shared/notifications/scheduler';

const REMINDER_IDS = Array.from(
  { length: REMINDER_ID_END - REMINDER_ID_START + 1 },
  (_, index) => REMINDER_ID_START + index,
);

/** The most recent plan, replayed each time the app leaves the foreground. */
let plan: ScheduledReminder[] = [];

/**
 * Assumed true until the platform says otherwise, so nothing is ever left
 * pending in a foreground the app has not been told it left. Backgrounding
 * fires `appStateChange`, which puts the plan back.
 */
let foreground = true;

// Capacitor calls are asynchronous. Serialize every cancel/replay so a
// background replay cannot finish scheduling after a newer foreground cancel
// and leave a reminder pending while the learner is already in the app.
let applyQueue: Promise<void> = Promise.resolve();

function scheduledDate(dayKey: string, localMinutes: number): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day, Math.floor(localMinutes / 60), localMinutes % 60, 0, 0);
}

/**
 * Nothing may be pending while the learner is in the app: a reminder to study
 * is noise on top of the thing it is reminding about, and iOS presents a local
 * notification in the foreground like any other unless it is marked silent —
 * which would hide it in the background too, where it is the whole point.
 */
async function applyPlan(): Promise<void> {
  await LocalNotifications.cancel({ notifications: REMINDER_IDS.map((id) => ({ id })) });
  if (foreground) return;
  const now = Date.now();
  const future = plan
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
}

function queuePlanApplication(): Promise<void> {
  const next = applyQueue
    .catch((error) => {
      console.error('Failed to apply the previous notification plan', error);
    })
    .then(applyPlan);
  applyQueue = next;
  return next;
}

const nativePort: NotificationPort = {
  async requestPermission() {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  },
  async cancel(_ids) {
    plan = [];
    // Reminder ids all live in the reserved range above. Going through the
    // same queue closes the race with an in-flight background replay.
    await queuePlanApplication();
  },
  async schedule(reminders: ScheduledReminder[]) {
    plan = reminders;
    await queuePlanApplication();
  },
};

export function configureNativeNotifications(): void {
  setNotificationPort(nativePort);
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    foreground = isActive;
    void queuePlanApplication().catch((error) => {
      console.error('Failed to update native study reminders', error);
    });
  });
}
