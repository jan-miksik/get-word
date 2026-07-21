import type { ActivityWindow, StudyWeekBucket, UsageWeekBucket } from '@/lib/stats/types';

export type SchoolPlan = 'pilot_v1';
export type SchoolRole = 'student' | 'teacher';
export type SchoolFeature = 'ai_translation' | 'photo_lab';

export type SchoolBenefitLimits = {
  photoLabMonthlyLimit: number;
  translationItemsMonthlyLimit: number;
  translationItemMaxChars: number;
};

export type SchoolEntitlement = {
  schoolId: string;
  schoolName: string;
  plan: SchoolPlan;
  role: SchoolRole;
  limits: SchoolBenefitLimits;
};

/**
 * One pseudonymized member row. Never carries a name, e-mail or user id: the
 * dashboard is visible to a school's own teachers, and per-student identity is
 * deliberately out of scope. `ordinal` is positional within the role and is not
 * stable across time — members are renumbered when someone leaves.
 */
export type SchoolMemberUsageRow = {
  ordinal: number;
  role: SchoolRole;
  /** YYYY-MM-DD; day granularity keeps rows harder to tie to a person. */
  joinedOn: string;
  lastActiveOn: string | null;
  reviews30d: number;
  translationItemsUsed: number;
  photoLabUsed: number;
};

export type SchoolUsageStats = {
  generatedAt: string;
  school: {
    id: string;
    name: string;
    plan: SchoolPlan;
    status: 'active' | 'inactive';
    pilotExpiresAt: string | null;
  };
  seats: {
    studentLimit: number;
    activeStudents: number;
    teacherLimit: number;
    activeTeachers: number;
  };
  /** Newly joined members per week — not membership headcount over time. */
  membership: { joinedWeekly: UsageWeekBucket[] };
  activity: { window: ActivityWindow; dau: number; wau: number; mau: number };
  study: {
    known30d: number;
    reallyKnown30d: number;
    unknown30d: number;
    studyingMembers30d: number;
    weekly: StudyWeekBucket[];
  };
  ai: {
    periodStart: string;
    resetAt: string;
    limits: Record<SchoolRole, { translationItemsMonthly: number; photoLabMonthly: number }>;
    translation: {
      /** Billed to this school in the period, including members who since left. */
      itemsUsed: number;
      requests: number;
      completed: number;
      failed: number;
      released: number;
      inFlight: number;
      charactersCharged: number;
      charactersReserved: number;
      /** Current members only, each against their own role's limit. */
      membersAtLimit: number;
    };
    photoLab: { used: number; membersAtLimit: number };
  };
  content: {
    teacherListsCreated: number;
    publicTeacherLists: number;
    /** Every subscription of current members, personal lists included. */
    memberSubscriptions: number;
    topPublicTeacherLists: {
      id: string;
      name: string;
      languageFrom: string;
      languageTo: string;
      /** Current members of this school subscribing — not global popularity. */
      schoolSubscriberCount: number;
    }[];
  };
  members: SchoolMemberUsageRow[];
};

export type SchoolSummary = {
  id: string;
  name: string;
  plan: SchoolPlan;
  status: 'active' | 'inactive';
  pilotExpiresAt: string | null;
  activeStudents: number;
  activeTeachers: number;
};
