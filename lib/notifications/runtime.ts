'use client';

import {
  REMINDER_ID_END,
  REMINDER_ID_START,
  computeSchedule,
  type ReminderScheduleInput,
  type ScheduledReminder,
} from '@/packages/product/shared/notifications/scheduler';

export interface NotificationPort {
  requestPermission(): Promise<boolean>;
  cancel(ids: number[]): Promise<void>;
  schedule(reminders: ScheduledReminder[]): Promise<void>;
}

let port: NotificationPort | null = null;

export function setNotificationPort(next: NotificationPort | null): void { port = next; }

export async function requestReminderPermission(): Promise<boolean> {
  return port ? port.requestPermission() : false;
}

export async function rescheduleReminders(input: ReminderScheduleInput): Promise<void> {
  if (!port) return;
  const ids = Array.from({ length: REMINDER_ID_END - REMINDER_ID_START + 1 }, (_, index) => REMINDER_ID_START + index);
  await port.cancel(ids);
  await port.schedule(computeSchedule(input));
}
