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
  getUserSubscribedItems,
  getUserOwnListItems,
  getListCategories,
  getSystemDefaultList,
  getWordIdToItemIdMapping,
  getWordListsByIds,
} from '@/lib/db'
import {
  signSession,
  WORDLINK_SESSION_COOKIE_NAME,
  WORDLINK_SESSION_TTL_SECONDS,
} from '@/lib/session'

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

type UserShape = {
  id: string
  role: string
  userRole?: string | null
  showEnglish: boolean | null
  showCategoryBadges: boolean | null
  showPronunciation?: boolean | null
  memoryHooksEnabled?: boolean | null
  memoryHookDisableFromStage?: number | null
  gameScore: number | null
  categoryOrder?: string[] | null
  walletAddress: string | null
  email: string | null
  authProvider: string | null
}

function createServerTimer() {
  const start = performance.now()
  const marks: Array<{ name: string; dur: number }> = []
  let last = start
  return {
    mark(name: string) {
      const now = performance.now()
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_")
      marks.push({ name: safeName, dur: now - last })
      last = now
    },
    totalMs() {
      return performance.now() - start
    },
    applyHeaders(response: NextResponse) {
      if (marks.length > 0) {
        response.headers.set(
          "Server-Timing",
          marks.map((m) => `${m.name};dur=${m.dur.toFixed(1)}`).join(", ")
        )
      }
      response.headers.set("x-wordlink-total-ms", this.totalMs().toFixed(1))
      return response
    },
  }
}

function buildSuccessResponse(
  user: UserShape,
  progress: Record<string, unknown>,
  categoryFilters: string[],
  hydratedLists: {
    rekeyedHooks: Record<string, string>
    wordListItems: Awaited<ReturnType<typeof getUserSubscribedItems>>
    categoryLookup: Record<string, { name: string; position: number }>
    listNameRows: Awaited<ReturnType<typeof getWordListsByIds>>
  }
) {
  return {
    success: true,
    user: {
      id: user.id,
      role: user.role,
      user_role: user.userRole ?? 'user',
      show_english: user.showEnglish ?? true,
      show_category_badges: user.showCategoryBadges ?? false,
      show_pronunciation: user.showPronunciation ?? false,
      memory_hooks_enabled: user.memoryHooksEnabled ?? true,
      memory_hook_disable_from_stage: user.memoryHookDisableFromStage ?? 8,
      game_score: user.gameScore ?? 0,
      category_order: user.categoryOrder ?? [],
      wallet_address: user.walletAddress ?? null,
      email: user.email ?? null,
      auth_provider: user.authProvider ?? null,
    },
    progress,
    memory_hooks: hydratedLists.rekeyedHooks,
    category_filters: categoryFilters,
    word_list_items: hydratedLists.wordListItems,
    categories: hydratedLists.categoryLookup,
    lists: hydratedLists.listNameRows,
  }
}

async function withSessionCookie(payload: Record<string, unknown>, userId: string, userRole?: string | null) {
  const safeUserRole = userRole === 'editor' ? 'editor' : 'user'
  const token = await signSession({
    userId,
    userRole: safeUserRole,
    ttlSeconds: WORDLINK_SESSION_TTL_SECONDS,
  })
  const response = NextResponse.json(payload)
  response.cookies.set({
    name: WORDLINK_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: WORDLINK_SESSION_TTL_SECONDS,
  })
  return response
}

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function rekeyByItemId<V>(
  data: Record<string, V>,
  mapping: Map<string, string>
): Record<string, V> {
  const result: Record<string, V> = {}
  for (const [key, value] of Object.entries(data)) {
    const newKey = mapping.get(key) ?? key
    result[newKey] = value
  }
  return result
}

async function getHydratedWordListData(
  userId: string,
  memoryHooks: Record<string, string>
): Promise<{
  rekeyedHooks: Record<string, string>
  wordListItems: Awaited<ReturnType<typeof getUserSubscribedItems>>
  categoryLookup: Record<string, { name: string; position: number }>
  listNameRows: Awaited<ReturnType<typeof getWordListsByIds>>
}> {
  const [subscribedItems, ownItems] = await Promise.all([
    getUserSubscribedItems(userId),
    getUserOwnListItems(userId),
  ])
  const wordListItems = [...subscribedItems, ...ownItems]
  const listIds = [...new Set(wordListItems.map((i) => i.listId))]

  const systemList = await getSystemDefaultList()
  const [categoryResults, wordIdMapping, listNameRows] = await Promise.all([
    Promise.all(listIds.map((id) => getListCategories(id))),
    systemList
      ? getWordIdToItemIdMapping(systemList.id)
      : Promise.resolve(new Map<string, string>()),
    getWordListsByIds(listIds),
  ])

  const categoryLookup: Record<string, { name: string; position: number }> = {}
  for (const cats of categoryResults) {
    for (const cat of cats) {
      categoryLookup[cat.id] = { name: cat.name, position: cat.position }
    }
  }

  const rekeyedHooks = rekeyByItemId(memoryHooks, wordIdMapping)

  return {
    rekeyedHooks,
    wordListItems,
    categoryLookup,
    listNameRows,
  }
}

export async function POST(request: NextRequest) {
  const timer = createServerTimer()
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
    const targetUser = emailUser ?? walletUser ?? deviceUser

    if (!targetUser) {
      const createdUser = await createUser({
        deviceId,
        walletAddress,
        ...(trimmedEmail && { email: trimmedEmail }),
        ...(authProvider != null &&
          String(authProvider).trim() !== '' && { authProvider: String(authProvider).trim() }),
      })
      timer.mark("create_user")
      const hydratedLists = await getHydratedWordListData(createdUser.id, {})
      timer.mark("hydrate_word_lists")
      const response = await withSessionCookie(
        buildSuccessResponse(createdUser, {}, [], hydratedLists),
        createdUser.id,
        createdUser.userRole
      )
      timer.mark("build_response")
      return timer.applyHeaders(response)
    }

    const sourceUsers = [deviceUser, walletUser].filter(
      (user, index, users): user is NonNullable<typeof user> =>
        user != null &&
        user.id !== targetUser.id &&
        users.findIndex((candidate) => candidate?.id === user.id) === index
    )

    // No merge needed: target already wins by priority, so just attach current identifiers.
    if (sourceUsers.length === 0) {
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
        buildSuccessResponse(linkedUser, progress, filters, hydratedLists),
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
      memoryHookDisableFromStage: targetUser.memoryHookDisableFromStage,
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

    const response = await withSessionCookie({
      success: true,
      merged: true,
      user: {
        id: mergedUser.id,
        role: targetUser.role,
        user_role: targetUser.userRole ?? 'user',
        show_english: targetUser.showEnglish ?? true,
        show_category_badges: targetUser.showCategoryBadges ?? false,
        show_pronunciation: targetUser.showPronunciation ?? false,
        memory_hooks_enabled: targetUser.memoryHooksEnabled ?? true,
        memory_hook_disable_from_stage: targetUser.memoryHookDisableFromStage ?? 8,
        game_score: mergedUser.gameScore ?? mergedGameScore,
        category_order: mergedUser.categoryOrder ?? mergedCategoryOrder,
        wallet_address: mergedUser.walletAddress ?? walletAddress,
        email: mergedUser.email ?? null,
        auth_provider: mergedUser.authProvider ?? null,
      },
      progress: finalProgress,
      memory_hooks: hydratedLists.rekeyedHooks,
      category_filters: finalFilters,
      word_list_items: hydratedLists.wordListItems,
      categories: hydratedLists.categoryLookup,
      lists: hydratedLists.listNameRows,
    }, mergedUser.id, mergedUser.userRole)
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
