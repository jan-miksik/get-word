import { addDays, isoWeekStart } from '@/packages/domain/goals/week';

interface ReminderDay {
  enabled: boolean;
  requiredDays: number;
  metDaysThisWeek: number;
  todayMet: boolean;
}

export interface ScheduledReminder {
  id: number;
  dayKey: string;
  localMinutes: number;
  title: string;
  body: string;
}

export interface ReminderScheduleInput {
  today: string;
  localMinutes: number;
  title: string;
  body: string;
  /** Resolves the version effective for each future local day. */
  day: (dayKey: string) => ReminderDay | null;
}

export const REMINDER_ID_START = 9000;
export const REMINDER_ID_END = 9031;

/** 7 daily prompts, then a quiet two-per-week tail through day 21. */
export function computeSchedule(input: ReminderScheduleInput): ScheduledReminder[] {
  const scheduled: ScheduledReminder[] = [];
  const seenWeeks = new Set<string>();
  for (let offset = 0; offset < 21 && scheduled.length < REMINDER_ID_END - REMINDER_ID_START + 1; offset += 1) {
    const dayKey = addDays(input.today, offset);
    const day = input.day(dayKey);
    if (!day?.enabled || day.todayMet || day.metDaysThisWeek >= day.requiredDays) continue;
    if (offset >= 7) {
      const weekday = new Date(`${dayKey}T12:00:00Z`).getUTCDay() || 7;
      // Monday and Thursday are the light-tail cadence.
      if (weekday !== 1 && weekday !== 4) continue;
      const week = isoWeekStart(dayKey);
      const key = `${week}:${weekday}`;
      if (seenWeeks.has(key)) continue;
      seenWeeks.add(key);
    }
    scheduled.push({
      id: REMINDER_ID_START + scheduled.length,
      dayKey,
      localMinutes: input.localMinutes,
      title: input.title,
      body: input.body,
    });
  }
  return scheduled;
}
