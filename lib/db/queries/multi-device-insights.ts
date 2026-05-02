import { sql } from 'drizzle-orm';
import { db } from '../client';

export interface MultiDeviceUsageStats {
  since: Date;
  activeDeviceUsers: {
    oneDevice: number;
    twoDevices: number;
    threeOrMoreDevices: number;
  };
  reviewActiveUsers: {
    oneDevice: number;
    twoOrMoreDevices: number;
  };
}

function numberFromRow(row: Record<string, unknown>, key: string): number {
  return Number(row[key] ?? 0) || 0;
}

export async function getMultiDeviceUsageStats({
  since,
}: {
  since: Date;
}): Promise<MultiDeviceUsageStats> {
  const sinceSql = since.toISOString();

  const [activeDeviceRow] = await db.execute(sql`
    WITH per_user AS (
      SELECT user_id, count(DISTINCT device_id)::int AS device_count
      FROM user_devices
      WHERE last_seen_at >= ${sinceSql}::timestamp
      GROUP BY user_id
    )
    SELECT
      count(*) FILTER (WHERE device_count = 1)::int AS one_device,
      count(*) FILTER (WHERE device_count = 2)::int AS two_devices,
      count(*) FILTER (WHERE device_count >= 3)::int AS three_or_more_devices
    FROM per_user
  `);

  const [reviewActiveRow] = await db.execute(sql`
    WITH per_user AS (
      SELECT user_id, count(DISTINCT device_id)::int AS device_count
      FROM review_events
      WHERE server_created_at >= ${sinceSql}::timestamp
        AND device_id IS NOT NULL
      GROUP BY user_id
    )
    SELECT
      count(*) FILTER (WHERE device_count = 1)::int AS one_device,
      count(*) FILTER (WHERE device_count >= 2)::int AS two_or_more_devices
    FROM per_user
  `);

  const activeDeviceRecord = (activeDeviceRow ?? {}) as Record<string, unknown>;
  const reviewActiveRecord = (reviewActiveRow ?? {}) as Record<string, unknown>;

  return {
    since,
    activeDeviceUsers: {
      oneDevice: numberFromRow(activeDeviceRecord, 'one_device'),
      twoDevices: numberFromRow(activeDeviceRecord, 'two_devices'),
      threeOrMoreDevices: numberFromRow(activeDeviceRecord, 'three_or_more_devices'),
    },
    reviewActiveUsers: {
      oneDevice: numberFromRow(reviewActiveRecord, 'one_device'),
      twoOrMoreDevices: numberFromRow(reviewActiveRecord, 'two_or_more_devices'),
    },
  };
}
