import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import {
  getActiveSchoolEntitlement,
  getSchoolFeatureUsage,
} from '@/features/schools/server/entitlements';

export async function GET(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return unauthorizedResponse();

  const entitlement = await getActiveSchoolEntitlement(user.id);
  if (!entitlement) {
    return NextResponse.json({ entitlement: null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const translationUsage = await getSchoolFeatureUsage({
    userId: user.id,
    feature: 'ai_translation',
  });

  return NextResponse.json(
    {
      entitlement: {
        school_id: entitlement.schoolId,
        school_name: entitlement.schoolName,
        plan: entitlement.plan,
        role: entitlement.role,
        limits: {
          photo_lab_monthly_limit: entitlement.limits.photoLabMonthlyLimit,
          translation_items_monthly_limit: entitlement.limits.translationItemsMonthlyLimit,
          translation_item_max_chars: entitlement.limits.translationItemMaxChars,
        },
        usage: {
          ai_translation: {
            used: translationUsage.used,
            limit: entitlement.limits.translationItemsMonthlyLimit,
            remaining: Math.max(
              0,
              entitlement.limits.translationItemsMonthlyLimit - translationUsage.used,
            ),
            reset_at: translationUsage.resetAt.toISOString(),
            period: 'month',
          },
        },
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
