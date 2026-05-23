import { NextRequest, NextResponse } from 'next/server'
import {
  getUserByDeviceId,
  getUserById,
  getUserByEmail,
  getUserByWalletAddress,
  createUser,
  mergeUserData,
  deleteUser,
  getUserProgress,
  getUserMemoryHooks,
  getUserCategoryFilters,
  setUserCategoryFilters,
  batchUpsertProgress,
  batchUpsertProgressByItemId,
  batchUpsertMemoryHooks,
  updateUserFields,
} from '@/lib/db'
import { withSessionCookie } from '@/features/shared/routes/session'
import { createRouteTimer } from '@/features/shared/routes/timing'
import { buildSyncSuccessPayload, getHydratedWordListData } from '@/features/shared/sync/response'
import { isUuid } from '@/features/shared/sync/identity'

interface LinkWalletRequest {
  deviceId: string
  walletAddress: string
  email?: string | null
  authProvider?: string | null // e.g. "email" | "google" | "apple" | "wallet"
}

// Trust model: The client provides a wallet address obtained from Reown's
// embedded wallet infrastructure (email/social login creates a non-custodial
// wallet). The server trusts that the client controls the wallet address it
// provides. Device IDs are UUIDs (hard to guess). For a language learning
// app this is an acceptable trust level. For higher-stakes data, consider
// server-side wallet ownership verification (e.g., SIWE).

function mergeCategoryOrder(
  targetOrder: string[] | null | undefined,
  sourceOrders: Array<string[] | null | undefined>
): string[] {
  const merged: string[] = []
  const pushUnique = (items: string[] | null | undefined) => {
    if (!Array.isArray(items)) return
    for (const raw of items) {
      const item = String(raw).trim()
      if (!item) continue
      if (!merged.includes(item)) merged.push(item)
    }
  }
  pushUnique(targetOrder)
  for (const s of sourceOrders) pushUnique(s)
  return merged.slice(0, 500)
}

function sameWalletAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase())
}

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase())
}

function deviceUserMatchesCurrentLogin(
  user: Awaited<ReturnType<typeof getUserByDeviceId>>,
  walletAddress: string,
  email: string | null
): boolean {
  if (!user) return false
  if (user.walletAddress) return sameWalletAddress(user.walletAddress, walletAddress)
  if (user.email) return sameEmail(user.email, email)
  return true
}

function canMergeDeviceUserIntoEmailLogin(
  user: Awaited<ReturnType<typeof getUserByDeviceId>>,
  email: string | null
): boolean {
  if (!user || !email) return false
  return !user.email || sameEmail(user.email, email)
}

export async function POST(request: NextRequest) {
  const timer = createRouteTimer()
  try {
    const body: LinkWalletRequest = await request.json()
    timer.mark("parse_body")
    const { deviceId, walletAddress, email, authProvider } = body

    if (!deviceId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: 'deviceId and walletAddress are required' },
        { status: 400 }
      )
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    const trimmedEmail =
      email != null && String(email).trim() !== '' ? String(email).trim() : null

    // Resolve account in strict priority order: email → wallet → device.
    const [emailUser, walletUser, deviceUser] = await Promise.all([
      trimmedEmail ? getUserByEmail(trimmedEmail) : Promise.resolve(null),
      getUserByWalletAddress(walletAddress),
      getUserByDeviceId(deviceId),
    ])
    timer.mark("resolve_users")
    const reusableDeviceUser = deviceUserMatchesCurrentLogin(
      deviceUser,
      walletAddress,
      trimmedEmail
    )
      ? deviceUser
      : null
    const detachedDeviceUser =
      deviceUser && deviceUser.id !== reusableDeviceUser?.id ? deviceUser : null
    const mergeableDetachedDeviceUser = canMergeDeviceUserIntoEmailLogin(
      detachedDeviceUser,
      trimmedEmail
    )
      ? detachedDeviceUser
      : null
    let targetUser = emailUser ?? walletUser ?? reusableDeviceUser
    let createdTargetUser = false

    if (detachedDeviceUser?.deviceId === deviceId) {
      await updateUserFields(detachedDeviceUser.id, { deviceId: null })
      timer.mark("detach_stale_device_user")
    }

    if (!targetUser) {
      targetUser = await createUser({
        deviceId,
        walletAddress,
        ...(trimmedEmail && { email: trimmedEmail }),
        ...(authProvider != null &&
          String(authProvider).trim() !== '' && { authProvider: String(authProvider).trim() }),
      })
      timer.mark("create_user")
      createdTargetUser = true
    }

    const sourceUsers = [reusableDeviceUser, walletUser, mergeableDetachedDeviceUser].filter(
      (user, index, users): user is NonNullable<typeof user> =>
        user != null &&
        user.id !== targetUser.id &&
        users.findIndex((candidate) => candidate?.id === user.id) === index
    )

    // No merge needed: target already wins by priority, so just attach current identifiers.
    if (sourceUsers.length === 0) {
      if (createdTargetUser) {
        const hydratedLists = await getHydratedWordListData(targetUser.id, {})
        timer.mark("hydrate_word_lists")
        const response = await withSessionCookie(
          buildSyncSuccessPayload(targetUser, {}, {}, [], hydratedLists),
          targetUser.id,
          targetUser.userRole
        )
        timer.mark("build_response")
        return timer.applyHeaders(response)
      }

      await updateUserFields(targetUser.id, {
        deviceId,
        walletAddress,
        ...(trimmedEmail && { email: trimmedEmail }),
        ...(authProvider != null &&
          String(authProvider).trim() !== '' && { authProvider: String(authProvider).trim() }),
      })
      timer.mark("update_user_fields")

      const linkedUser = (await getUserById(targetUser.id)) ?? targetUser
      const [progress, hooks, filters] = await Promise.all([
        getUserProgress(linkedUser.id),
        getUserMemoryHooks(linkedUser.id),
        getUserCategoryFilters(linkedUser.id),
      ])
      timer.mark("fetch_user_data")
      const hydratedLists = await getHydratedWordListData(linkedUser.id, hooks)
      timer.mark("hydrate_word_lists")
      const response = await withSessionCookie(
        buildSyncSuccessPayload(linkedUser, progress, hooks, filters, hydratedLists),
        linkedUser.id,
        linkedUser.userRole
      )
      timer.mark("build_response")
      return timer.applyHeaders(response)
    }

    const [targetProgress, targetHooksRaw, targetFilters, ...sourceData] = await Promise.all([
      getUserProgress(targetUser.id),
      getUserMemoryHooks(targetUser.id),
      getUserCategoryFilters(targetUser.id),
      ...sourceUsers.flatMap((user) => [
        getUserProgress(user.id),
        getUserMemoryHooks(user.id),
        getUserCategoryFilters(user.id),
      ]),
    ])
    timer.mark("fetch_merge_sources")

    let mergedProgress: Record<string, { stageIndex: number; knownCount: number; unknownCount: number; lastKnownAt: Date | null; lastUnknownAt: Date | null; nextDueAt: Date | null }> = targetProgress
    let mergedHooks: Record<string, string> = { ...targetHooksRaw }
    let mergedFilters: string[] = targetFilters

    for (let i = 0; i < sourceUsers.length; i++) {
      const base = i * 3
      const sp = sourceData[base] as Record<string, { stageIndex: number; knownCount: number; unknownCount: number; lastKnownAt: Date | null; lastUnknownAt: Date | null; nextDueAt: Date | null }>
      const sh = sourceData[base + 1] as Record<string, string>
      const sf = sourceData[base + 2] as string[]
      const merged = mergeUserData({
        sourceProgress: sp,
        targetProgress: mergedProgress,
        sourceHooks: sh,
        targetHooks: mergedHooks,
        sourceFilters: sf,
        targetFilters: mergedFilters,
      })
      mergedProgress = merged.mergedProgress
      mergedHooks = merged.mergedHooks
      mergedFilters = merged.mergedFilters
    }

    const progressToUpsertByWordId: Array<{
      userId: string
      wordId: string
      stageIndex: number
      knownCount: number
      unknownCount: number
      lastKnownAt: Date | null
      lastUnknownAt: Date | null
      nextDueAt: Date | null
    }> = []
    const progressToUpsertByItemId: Array<{
      userId: string
      wordListItemId: string
      stageIndex: number
      knownCount: number
      unknownCount: number
      lastKnownAt: Date | null
      lastUnknownAt: Date | null
      nextDueAt: Date | null
    }> = []

    for (const [progressKey, item] of Object.entries(mergedProgress)) {
      const base = {
        userId: targetUser.id,
        stageIndex: item.stageIndex,
        knownCount: item.knownCount,
        unknownCount: item.unknownCount,
        lastKnownAt: item.lastKnownAt,
        lastUnknownAt: item.lastUnknownAt,
        nextDueAt: item.nextDueAt,
      }
      if (isUuid(progressKey)) {
        progressToUpsertByItemId.push({ ...base, wordListItemId: progressKey })
      } else {
        progressToUpsertByWordId.push({ ...base, wordId: progressKey })
      }
    }
    if (progressToUpsertByWordId.length > 0) await batchUpsertProgress(progressToUpsertByWordId)
    if (progressToUpsertByItemId.length > 0) await batchUpsertProgressByItemId(progressToUpsertByItemId)
    if (Object.keys(mergedHooks).length > 0) await batchUpsertMemoryHooks(targetUser.id, mergedHooks)
    await setUserCategoryFilters(targetUser.id, mergedFilters)
    timer.mark("apply_merged_data")

    for (const sourceUser of sourceUsers) {
      const uniqueFieldResets: {
        deviceId?: string | null
        walletAddress?: string | null
        email?: string | null
      } = {}
      if (sourceUser.deviceId === deviceId) {
        uniqueFieldResets.deviceId = null
      }
      if (sourceUser.walletAddress === walletAddress) {
        uniqueFieldResets.walletAddress = null
      }
      if (trimmedEmail && sourceUser.email === trimmedEmail) {
        uniqueFieldResets.email = null
      }
      if (Object.keys(uniqueFieldResets).length > 0) {
        await updateUserFields(sourceUser.id, uniqueFieldResets)
      }
    }

    const mergedGameScore = Math.max(
      0,
      sourceUsers.reduce((sum, user) => sum + (user.gameScore ?? 0), 0) +
        (targetUser.gameScore ?? 0)
    )

    const mergedCategoryOrder = mergeCategoryOrder(
      targetUser.categoryOrder,
      sourceUsers.map((u) => u.categoryOrder)
    )

    await updateUserFields(targetUser.id, {
      deviceId,
      walletAddress,
      role: targetUser.role,
      userRole: targetUser.userRole,
      showEnglish: targetUser.showEnglish,
      showCategoryBadges: targetUser.showCategoryBadges,
      showPronunciation: targetUser.showPronunciation,
      memoryHooksEnabled: targetUser.memoryHooksEnabled,
      memoryHooksIntroAnswered: targetUser.memoryHooksIntroAnswered,
      memoryHookDisableFromStage: targetUser.memoryHookDisableFromStage,
      settingsLanguage: targetUser.settingsLanguage,
      settingsLanguageSelectedAt: targetUser.settingsLanguageSelectedAt,
      gameScore: mergedGameScore,
      categoryOrder: mergedCategoryOrder,
      ...(trimmedEmail && { email: trimmedEmail }),
      ...(authProvider != null && String(authProvider).trim() !== '' && { authProvider: String(authProvider).trim() }),
    })
    timer.mark("update_target_user")

    for (const sourceUser of sourceUsers) {
      await deleteUser(sourceUser.id)
    }
    timer.mark("delete_source_users")

    const mergedUser = (await getUserById(targetUser.id)) ?? targetUser
    const [finalProgress, finalHooks, finalFilters] = await Promise.all([
      getUserProgress(mergedUser.id),
      getUserMemoryHooks(mergedUser.id),
      getUserCategoryFilters(mergedUser.id),
    ])
    timer.mark("fetch_final_data")
    const hydratedLists = await getHydratedWordListData(mergedUser.id, finalHooks)
    timer.mark("hydrate_word_lists")

    const response = await withSessionCookie(
      buildSyncSuccessPayload(
        {
          ...mergedUser,
          role: targetUser.role,
          userRole: targetUser.userRole ?? mergedUser.userRole,
          showEnglish: targetUser.showEnglish,
          showCategoryBadges: targetUser.showCategoryBadges,
          showPronunciation: targetUser.showPronunciation,
          memoryHooksEnabled: targetUser.memoryHooksEnabled,
          memoryHooksIntroAnswered:
            mergedUser.memoryHooksIntroAnswered ?? targetUser.memoryHooksIntroAnswered,
          memoryHookDisableFromStage: targetUser.memoryHookDisableFromStage,
          settingsLanguage: mergedUser.settingsLanguage ?? targetUser.settingsLanguage,
          settingsLanguageSelectedAt:
            mergedUser.settingsLanguageSelectedAt ?? targetUser.settingsLanguageSelectedAt,
          gameScore: mergedUser.gameScore ?? mergedGameScore,
          categoryOrder: mergedUser.categoryOrder ?? mergedCategoryOrder,
          walletAddress: mergedUser.walletAddress ?? walletAddress,
          email: mergedUser.email ?? null,
          authProvider: mergedUser.authProvider ?? null,
        },
        finalProgress,
        finalHooks,
        finalFilters,
        hydratedLists,
        { merged: true }
      ),
      mergedUser.id,
      mergedUser.userRole
    )
    timer.mark("build_response")
    return timer.applyHeaders(response)
  } catch (error) {
    timer.mark("error")
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Link wallet error:', err.message)
    console.error(err.stack)
    // Return generic message to client; server logs hold the real cause (e.g. missing column → run db:migrate)
    const errorMessage = 'Failed to link wallet. If this persists, ensure database migrations are applied (pnpm run db:migrate).'
    const failed = NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
    return timer.applyHeaders(failed)
  }
}
