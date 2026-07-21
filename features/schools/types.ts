export type SchoolPlan = 'pilot_v1';
export type SchoolRole = 'student' | 'teacher';
export type SchoolFeature = 'ai_translation';

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
