import type { ActivityWindow, StudyWeekBucket, UsageWeekBucket } from '@/lib/stats/types';
import type {
  DeviceFormFactor,
  DevicePlatform,
} from '@/packages/contracts/src/device';

export type { ActivityWindow, StudyWeekBucket, UsageWeekBucket };
export type {
  DeviceFormFactor,
  DevicePlatform,
} from '@/packages/contracts/src/device';

export interface UsageStatsOptions {
  activityWindow?: ActivityWindow;
  excludedUserIds?: string[];
  excludedUserEmails?: string[];
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

export interface WordChatUsageAccountRow {
  handle: string;
  email: string | null;
  registered: boolean;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface GoogleApiUsageSourceRow {
  scope: 'translate' | 'tts';
  source: string;
  model: string | null;
  units: number;
  requests: number;
}

/**
 * One target language across all learners. "Studied" always means an actual
 * review event on an item of a list in that language, never a subscription or
 * a menu setting — `selectedBy` carries the settings-level signal separately so
 * a learner who set a pair up and never started is not counted as studying it.
 */
export interface LanguageTargetRow {
  language: string;
  learners: number;
  learners30d: number;
  reviews: number;
  selectedBy: number;
}

/** One studied direction: `languageFrom` known → `languageTo` learned. */
export interface LanguagePairRow {
  languageFrom: string;
  languageTo: string;
  learners: number;
  learners30d: number;
  reviews: number;
  selectedBy: number;
}

/**
 * A learner's goal as it stands today — the version in force, not a pending one
 * scheduled for tomorrow. `minutesPerDay` and `newWordsPerDay` are mode-specific
 * and only the one matching `mode` is meaningful.
 */
export interface UserGoalSetting {
  enabled: boolean;
  mode: 'minutes' | 'words';
  preset: string;
  daysPerWeek: number;
  minutesPerDay: number | null;
  newWordsPerDay: number | null;
  effectiveFromDay: string;
}

/**
 * How a goal actually went over the trailing 30 local days.
 *
 * `expectedDays` is the promise prorated, not the number of calendar days:
 * the goal is *n days a week*, so a tracked day contributes `daysPerWeek / 7`
 * of a promised day. That keeps a four-days-a-week learner who studied four
 * days at 100 % instead of 57 %, and it follows a goal that changed mid-window
 * because the day rollup snapshots `goalDaysPerWeek` per day.
 *
 * `eligibleDays` counts calendar days on which an enabled goal was in force.
 * A missing `user_day_stats` row is a missed day, not a neutral one; only a real
 * snapshot explicitly marked `nothing_due` is removed from the promise.
 */
export interface UserGoalProgress {
  eligibleDays: number;
  metDays: number;
  expectedDays: number;
  lastMetDay: string | null;
}

/** Share of the promise kept over the window, bucketed for the aggregate view. */
export type GoalAdherenceBucket = 'none' | 'low' | 'mid' | 'high' | 'full';

export interface GoalDistributionBucket {
  key: string;
  users: number;
}

export interface UiLanguageRequestRow {
  languageCode: string;
  requesters: number;
  lastRequestedAt: string;
}

/** One day in the app-wide GitHub-style activity heatmap. */
export interface ActivityHeatmapDay {
  date: string; // YYYY-MM-DD (UTC)
  activeUsers: number; // distinct users with >=1 review that day
}

/** One day in a single user's mini activity heatmap. */
export interface UserActivityDay {
  date: string; // YYYY-MM-DD, the learner's own local day
  count: number; // that user's reviews that day
  /**
   * Measured foreground time that day. A day can have this and no reviews at
   * all — the learner opened the app, browsed, added words and never answered
   * a card. Those days count as active; see `AdminUserRow.activeDays`.
   */
  activeSeconds: number;
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
  /**
   * Distinct days the learner was in the app at all, in their own local day —
   * measured presence as well as answered cards. Counting review events on the
   * server's UTC date instead reported neither: a day spent adding words scored
   * zero, and an offline evening session landed on whichever day the outbox
   * next flushed.
   */
  activeDays: number;
  studySessions: number;
  /** Inferred from review-event gaps; the only figure available historically. */
  estActiveStudySeconds: number;
  /**
   * Measured foreground time over the last 30 days. Device-time: concurrent
   * tabs and devices are summed, not unioned, so this is an operator figure
   * rather than one to show a learner.
   */
  activeSeconds30d: number;
  sessions30d: number;
  /** Median session length, defined as summed active time per session. */
  medianSessionSeconds: number;
  photoAnalyses: number;
  /** Pair currently selected in the app; set up is not the same as studied. */
  selectedLanguageFrom: string | null;
  selectedLanguageTo: string | null;
  /** Target languages this learner has actually reviewed in, most-studied first. */
  studiedLanguages: { language: string; reviews: number }[];
  /** Null when the account never set a goal, or set one only for a future day. */
  goal: UserGoalSetting | null;
  goalProgress30d: UserGoalProgress;
  dailyActivity: UserActivityDay[]; // sparse: only active days, last 53 weeks
}

export interface UsageStats {
  generatedAt: string;
  registrations: {
    total: number;
    email: number;
    google: number;
    apple: number;
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
  /**
   * Measured foreground time over the last 30 days, as opposed to
   * `AdminUserRow.estActiveStudySeconds`, which is inferred from review-event
   * gaps. Empty until enough clients have shipped the tracker.
   */
  activity30d: {
    /** Device-time: concurrent tabs/devices are summed, not unioned. */
    activeSeconds: number;
    sessions: number;
    usersWithActivity: number;
    medianSessionSeconds: number;
    bySurface: { surface: string; activeSeconds: number; sessions: number }[];
  };
  /**
   * Who studies what. Everything here is keyed on the *studied* language, from
   * review events joined through the item to its list, so it answers "is anyone
   * actually learning this" rather than "who once subscribed".
   */
  languages: {
    /** Learners with >= 1 review attributable to a language. */
    learners: number;
    learners30d: number;
    /** Learners studying >= 2 distinct target languages. */
    multiLanguageLearners: number;
    multiLanguageLearners30d: number;
    targets: LanguageTargetRow[];
    pairs: LanguagePairRow[];
  };
  /**
   * Who set what goal and how it is going. Adherence is measured against the
   * prorated weekly promise — see `UserGoalProgress`.
   */
  goals: {
    /** Accounts whose goal in force today is switched on. */
    enabled: number;
    /** Accounts that set a goal and then switched it off. */
    disabled: number;
    minutesMode: number;
    wordsMode: number;
    /** Summed across every learner, so one busy account cannot skew a mean. */
    metDays30d: number;
    expectedDays30d: number;
    eligibleDays30d: number;
    /** Learners with at least one day the goal could have been met. */
    trackedLearners30d: number;
    /** Goal set, but no day in the window could be measured against it. */
    untrackedLearners30d: number;
    adherence: { bucket: GoalAdherenceBucket; learners: number }[];
    daysPerWeek: GoalDistributionBucket[];
    dailyTarget: GoalDistributionBucket[];
    presets: GoalDistributionBucket[];
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
  wordChat: {
    monthStart: string;
    monthlyLimitUsd: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    accounts: WordChatUsageAccountRow[];
  };
  googleApi: {
    monthStart: string;
    translateFreeUnits: number;
    ttsFreeUnits: number;
    translateUnits: number;
    ttsUnits: number;
    requests: number;
    estimatedTranslationCostUsd: number;
    sources: GoogleApiUsageSourceRow[];
  };
  uiLanguageRequests: {
    totalRequests: number;
    languages: UiLanguageRequestRow[];
  };
  activityHeatmap: ActivityHeatmapDay[]; // sparse: only days with activity, last 53 weeks
  users: AdminUserRow[];
}
