export type ContentReportReason =
  | 'sexual_content'
  | 'hate_or_harassment'
  | 'violence_or_danger'
  | 'illegal_content'
  | 'spam_or_misleading'
  | 'copyright'
  | 'other';

export type ContentReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';

export type ModerationDecisionCode =
  | 'no_violation'
  | 'sexual_content'
  | 'hate_or_harassment'
  | 'violence_or_danger'
  | 'illegal_content'
  | 'spam_or_misleading'
  | 'copyright'
  | 'other_policy_violation';

export type ModerationReportRow = {
  id: string;
  listId: string | null;
  currentListName: string | null;
  currentListDescription: string | null;
  listNameSnapshot: string;
  listDescriptionSnapshot: string | null;
  contentExcerpt: string | null;
  ownerHandle: string | null;
  reason: ContentReportReason;
  details: string | null;
  status: ContentReportStatus;
  decisionCode: ModerationDecisionCode | null;
  publicNote: string | null;
  moderatorNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type MyContentReportRow = {
  id: string;
  listName: string;
  reason: ContentReportReason;
  details: string | null;
  status: ContentReportStatus;
  decisionCode: ModerationDecisionCode | null;
  publicNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export const CONTENT_REPORT_REASON_VALUES: ContentReportReason[] = [
  'sexual_content',
  'hate_or_harassment',
  'violence_or_danger',
  'illegal_content',
  'spam_or_misleading',
  'copyright',
  'other',
];

export const MODERATION_VIOLATION_DECISION_VALUES: Exclude<ModerationDecisionCode, 'no_violation'>[] = [
  'sexual_content',
  'hate_or_harassment',
  'violence_or_danger',
  'illegal_content',
  'spam_or_misleading',
  'copyright',
  'other_policy_violation',
];

export function isModerationViolationDecision(
  value: unknown,
): value is Exclude<ModerationDecisionCode, 'no_violation'> {
  return typeof value === 'string'
    && MODERATION_VIOLATION_DECISION_VALUES.includes(
      value as Exclude<ModerationDecisionCode, 'no_violation'>,
    );
}

export function isContentReportReason(value: unknown): value is ContentReportReason {
  return typeof value === 'string' && CONTENT_REPORT_REASON_VALUES.includes(value as ContentReportReason);
}
