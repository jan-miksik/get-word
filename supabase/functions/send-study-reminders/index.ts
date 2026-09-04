import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

import { reminderCopyFor } from './messages.ts';

type ClaimedReminder = {
  delivery_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
  day_key: string;
  scheduled_for: string;
  /** Already resolved by `claim_due_web_push_reminders`: the device's own
   * language, else the account's picked one, else the language it studies
   * from. Null only when none of the three is known. */
  reminder_language: string | null;
};

const required = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
};

function isExpiredPushEndpoint(error: unknown): boolean {
  const statusCode = typeof error === 'object' && error !== null
    ? Number((error as { statusCode?: unknown }).statusCode)
    : 0;
  return statusCode === 404 || statusCode === 410;
}

async function mapConcurrent<T>(
  rows: T[],
  concurrency: number,
  callback: (row: T) => Promise<void>,
): Promise<void> {
  const waiting = [...rows];
  const workers = Array.from({ length: Math.min(concurrency, waiting.length) }, async () => {
    while (waiting.length > 0) {
      const row = waiting.shift();
      if (row) await callback(row);
    }
  });
  await Promise.all(workers);
}

Deno.serve(async (request) => {
  try {
    if (request.headers.get('x-study-reminder-cron') !== required('STUDY_REMINDER_CRON_SECRET')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
      required('SUPABASE_URL'),
      required('SUPABASE_SERVICE_ROLE_KEY'),
    );
    webpush.setVapidDetails(
      required('WEB_PUSH_VAPID_SUBJECT'),
      required('WEB_PUSH_VAPID_PUBLIC_KEY'),
      required('WEB_PUSH_VAPID_PRIVATE_KEY'),
    );
    const { data, error } = await supabase.rpc('claim_due_web_push_reminders', { p_limit: 100 });
    if (error) throw error;
    const reminders = (data ?? []) as ClaimedReminder[];
    let sent = 0;
    let failed = 0;
    let expired = 0;

    await mapConcurrent(reminders, 20, async (reminder) => {
      let acceptedByPushService = false;
      try {
        await webpush.sendNotification({
          endpoint: reminder.endpoint,
          keys: { p256dh: reminder.p256dh, auth: reminder.auth },
        }, JSON.stringify({
          // The payload is the whole notification: a service worker cannot look
          // up the learner's interface language, so the copy is chosen here.
          ...reminderCopyFor(reminder.reminder_language),
          url: '/?source=study-reminder',
        }), { TTL: 60 * 60 });
        acceptedByPushService = true;
        const { error: completeError } = await supabase.rpc('complete_web_push_reminder_delivery', {
          p_delivery_id: reminder.delivery_id,
          p_success: true,
        });
        if (completeError) throw completeError;
        sent += 1;
      } catch (error) {
        if (isExpiredPushEndpoint(error)) {
          await supabase.from('web_push_subscriptions').delete().eq('id', reminder.subscription_id);
          expired += 1;
          // Keep the delivery as a permanent dedupe record. The subscription is
          // gone, so retrying it cannot help and must not create a second daily
          // notification when the learner later subscribes on another device.
          await supabase.rpc('complete_web_push_reminder_delivery', {
            p_delivery_id: reminder.delivery_id,
            p_success: true,
          });
        } else if (acceptedByPushService) {
          failed += 1;
          // Delivery was already accepted by the push service. Retain the
          // claimed row even if marking it sent failed, otherwise the next cron
          // run would release it and send the learner a duplicate notification.
          console.error('[study-reminders] push sent but completion mark failed', {
            deliveryId: reminder.delivery_id,
            message: error instanceof Error ? error.message : String(error),
          });
        } else {
          failed += 1;
          // Release a transient failure so the next 10-minute run can retry
          // within the 15-minute delivery window.
          await supabase.rpc('complete_web_push_reminder_delivery', {
            p_delivery_id: reminder.delivery_id,
            p_success: false,
          });
          console.error('[study-reminders] push delivery failed', {
            deliveryId: reminder.delivery_id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    return Response.json({ claimed: reminders.length, sent, failed, expired });
  } catch (error) {
    console.error('[study-reminders] scheduler failed', error);
    return Response.json({ error: 'Study reminder scheduler failed' }, { status: 500 });
  }
});
