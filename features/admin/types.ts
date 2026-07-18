export type ActivityWindow = 'rolling' | 'calendar';

export interface UsageStatsOptions {
  activityWindow?: ActivityWindow;
  excludedUserIds?: string[];
  excludedUserEmails?: string[];
}

export interface UsageWeekBucket {
  weekStart: string;
  count: number;
  partial?: boolean;
}

export interface StudyWeekBucket {
  weekStart: string;
  reviews: number;
  activeUsers: number;
  partial?: boolean;
}

interface RetentionBucket {
  eligible: number;
  returned: number;
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
    }[];
  };
  retention: {
    d1: RetentionBucket;
    d7: RetentionBucket;
    d30: RetentionBucket;
  };
}
