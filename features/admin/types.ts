import type { ActivityWindow, StudyWeekBucket, UsageWeekBucket } from '@/lib/stats/types';

export type { ActivityWindow, StudyWeekBucket, UsageWeekBucket };

export interface UsageStatsOptions {
  activityWindow?: ActivityWindow;
  excludedUserIds?: string[];
  excludedUserEmails?: string[];
}

export type DevicePlatform =
  | 'ios'
  | 'android'
  | 'macos'
  | 'windows'
  | 'linux'
  | 'other'
  | 'unknown';

export type DeviceFormFactor = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export interface DeviceProfile {
  platform?: DevicePlatform;
  formFactor?: DeviceFormFactor;
}

interface RetentionBucket {
  eligible: number;
  returned: number;
}

export interface DeviceBreakdownBucket {
  key: DevicePlatform | DeviceFormFactor;
  users: number;
}

export interface PhotoUsageWeekBucket {
  weekStart: string;
  analyses: number;
  users: number;
  partial?: boolean;
}

/** One day in the app-wide GitHub-style activity heatmap. */
export interface ActivityHeatmapDay {
  date: string; // YYYY-MM-DD (UTC)
  activeUsers: number; // distinct users with >=1 review that day
}

/** One day in a single user's mini activity heatmap. */
export interface UserActivityDay {
  date: string; // YYYY-MM-DD (UTC)
  count: number; // that user's reviews that day
}

/**
 * One registered user in the "who to write to" table. Behaviour only — no saved
 * words or other content. `email` is present in the payload (editor-only route)
 * but the UI keeps it hidden until an explicit per-row reveal.
 */
export interface AdminUserRow {
  handle: string;
  email: string;
  firstSeenAt: string;
  registeredAt: string | null;
  lastSeenAt: string | null;
  lastDevicePlatform: DevicePlatform;
  lastDeviceFormFactor: DeviceFormFactor;
  deviceCount: number;
  gameScore: number;
  reviewCount: number;
  activeDays: number;
  studySessions: number;
  estActiveStudySeconds: number;
  photoAnalyses: number;
  dailyActivity: UserActivityDay[]; // sparse: only days with >=1 review, last 53 weeks
}

export interface UsageStats {
  generatedAt: string;
  registrations: {
    total: number;
    email: number;
    google: number;
    other: number;
    anonymous: number;
    weekly: UsageWeekBucket[];
  };
  activity: {
    window: ActivityWindow;
    dau: number;
    wau: number;
    mau: number;
    yau: number;
    mauRegistered: number;
    mauAnonymous: number;
    yauRegistered: number;
    yauAnonymous: number;
  };
  devices: {
    activeDevices30d: number;
    knownDevices30d: number;
    iosUsers30d: number;
    androidUsers30d: number;
    mobileUsers30d: number;
    desktopUsers30d: number;
    multiDeviceUsers30d: number;
    platformBreakdown30d: DeviceBreakdownBucket[];
    formFactorBreakdown30d: DeviceBreakdownBucket[];
  };
  study: {
    known30d: number;
    reallyKnown30d: number;
    unknown30d: number;
    studyingUsers30d: number;
    weekly: StudyWeekBucket[];
  };
  content: {
    totalLists: number;
    publicLists: number;
    totalSubscriptions: number;
    topLists: {
      id: string;
      name: string;
      languageFrom: string;
      languageTo: string;
      subscriberCount: number;
      activeSubscriberCount: number;
    }[];
  };
  retention: {
    d1: RetentionBucket;
    d7: RetentionBucket;
    d30: RetentionBucket;
  };
  photo: {
    totalAnalyses: number;
    users: number;
    repeatUsers: number;
    repeatRate: number;
    trackedSince: string;
    firstEventAt: string | null;
    weekly: PhotoUsageWeekBucket[];
  };
  activityHeatmap: ActivityHeatmapDay[]; // sparse: only days with activity, last 53 weeks
  users: AdminUserRow[];
}
