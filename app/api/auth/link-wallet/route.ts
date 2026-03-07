import { NextRequest, NextResponse } from 'next/server'
import {
  getUserByDeviceId,
  getUserById,
  getUserByEmail,
  getUserByWalletAddress,
  mergeUserData,
  deleteUser,
  getUserProgress,
  getUserMemoryHooks,
  getUserCategoryFilters,
  setUserCategoryFilters,
  batchUpsertProgress,
  batchUpsertMemoryHooks,
  updateUserFields,
} from '@/lib/db'

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
  showEnglish: boolean | null
  showCategoryBadges: boolean | null
  gameScore: number | null
  walletAddress: string | null
  email: string | null
  authProvider: string | null
}

function buildSuccessResponse(
  user: UserShape,
  progress: Record<string, unknown>,
  memoryHooks: Record<string, string>,
  categoryFilters: string[]
) {
  return {
    success: true,
    user: {
      id: user.id,
      role: user.role,
      show_english: user.showEnglish ?? true,
      show_category_badges: user.showCategoryBadges ?? false,
      game_score: user.gameScore ?? 0,
      wallet_address: user.walletAddress ?? null,
      email: user.email ?? null,
      auth_provider: user.authProvider ?? null,
    },
    progress,
    memory_hooks: memoryHooks,
    category_filters: categoryFilters,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: LinkWalletRequest = await request.json()
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
    const targetUser = emailUser ?? walletUser ?? deviceUser

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'No user found for this email, wallet, or device' },
        { status: 404 }
      )
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

      const linkedUser = (await getUserById(targetUser.id)) ?? targetUser
      const [progress, hooks, filters] = await Promise.all([
        getUserProgress(linkedUser.id),
        getUserMemoryHooks(linkedUser.id),
        getUserCategoryFilters(linkedUser.id),
      ])
      return NextResponse.json(buildSuccessResponse(linkedUser, progress, hooks, filters))
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

    const progressToUpsert = Object.entries(mergedProgress).map(([wordId, item]) => ({
      userId: targetUser.id,
      wordId,
      stageIndex: item.stageIndex,
      knownCount: item.knownCount,
      unknownCount: item.unknownCount,
      lastKnownAt: item.lastKnownAt,
      lastUnknownAt: item.lastUnknownAt,
      nextDueAt: item.nextDueAt,
    }))
    if (progressToUpsert.length > 0) await batchUpsertProgress(progressToUpsert)
    if (Object.keys(mergedHooks).length > 0) await batchUpsertMemoryHooks(targetUser.id, mergedHooks)
    await setUserCategoryFilters(targetUser.id, mergedFilters)

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

    const preferredSourceUser = deviceUser ?? walletUser ?? targetUser
    const mergedGameScore = Math.max(
      0,
      sourceUsers.reduce((sum, user) => sum + (user.gameScore ?? 0), 0) +
        (targetUser.gameScore ?? 0)
    )

    await updateUserFields(targetUser.id, {
      deviceId,
      walletAddress,
      role: preferredSourceUser.role,
      showEnglish: preferredSourceUser.showEnglish,
      showCategoryBadges: preferredSourceUser.showCategoryBadges,
      gameScore: mergedGameScore,
      ...(trimmedEmail && { email: trimmedEmail }),
      ...(authProvider != null && String(authProvider).trim() !== '' && { authProvider: String(authProvider).trim() }),
    })

    for (const sourceUser of sourceUsers) {
      await deleteUser(sourceUser.id)
    }

    const mergedUser = (await getUserById(targetUser.id)) ?? targetUser
    const [finalProgress, finalHooks, finalFilters] = await Promise.all([
      getUserProgress(mergedUser.id),
      getUserMemoryHooks(mergedUser.id),
      getUserCategoryFilters(mergedUser.id),
    ])

    return NextResponse.json({
      success: true,
      merged: true,
      user: {
        id: mergedUser.id,
        role: preferredSourceUser.role,
        show_english: preferredSourceUser.showEnglish ?? true,
        show_category_badges: preferredSourceUser.showCategoryBadges ?? false,
        game_score: mergedUser.gameScore ?? mergedGameScore,
        wallet_address: mergedUser.walletAddress ?? walletAddress,
        email: mergedUser.email ?? null,
        auth_provider: mergedUser.authProvider ?? null,
      },
      progress: finalProgress,
      memory_hooks: finalHooks,
      category_filters: finalFilters,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Link wallet error:', err.message)
    console.error(err.stack)
    // Return generic message to client; server logs hold the real cause (e.g. missing column → run db:migrate)
    const errorMessage = 'Failed to link wallet. If this persists, ensure database migrations are applied (pnpm run db:migrate).'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
