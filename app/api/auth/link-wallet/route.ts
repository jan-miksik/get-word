import { NextRequest, NextResponse } from 'next/server'
import {
  getUserByDeviceId,
  getUserByWalletAddress,
  linkWalletToUser,
  mergeUserData,
  deleteUser,
  getUserProgress,
  getUserMemoryHooks,
  getUserCategoryFilters,
  setUserCategoryFilters,
  batchUpsertProgress,
  batchUpsertMemoryHooks,
  db,
  users,
} from '@/lib/db'
import { eq } from 'drizzle-orm'

interface LinkWalletRequest {
  deviceId: string
  walletAddress: string
}

// Trust model: The client provides a wallet address obtained from Reown's
// embedded wallet infrastructure (email/social login creates a non-custodial
// wallet). The server trusts that the client controls the wallet address it
// provides. Device IDs are UUIDs (hard to guess). For a language learning
// app this is an acceptable trust level. For higher-stakes data, consider
// server-side wallet ownership verification (e.g., SIWE).

export async function POST(request: NextRequest) {
  try {
    const body: LinkWalletRequest = await request.json()
    const { deviceId, walletAddress } = body

    if (!deviceId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: 'deviceId and walletAddress are required' },
        { status: 400 }
      )
    }

    // Find the current anonymous user by device ID
    const currentUser = await getUserByDeviceId(deviceId)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'No user found for this device' },
        { status: 404 }
      )
    }

    // Check if wallet is already linked to the same user (idempotent)
    if (currentUser.walletAddress === walletAddress) {
      const [progress, hooks, filters] = await Promise.all([
        getUserProgress(currentUser.id),
        getUserMemoryHooks(currentUser.id),
        getUserCategoryFilters(currentUser.id),
      ])

      return NextResponse.json({
        success: true,
        user: {
          id: currentUser.id,
          role: currentUser.role,
          show_english: currentUser.showEnglish ?? true,
          show_category_badges: currentUser.showCategoryBadges ?? false,
        },
        progress,
        memory_hooks: hooks,
        category_filters: filters,
      })
    }

    // Check if wallet is linked to a different user (cross-device merge case)
    const existingWalletUser = await getUserByWalletAddress(walletAddress)

    if (!existingWalletUser) {
      // Case 1: Fresh link - just add wallet to current user
      await linkWalletToUser(currentUser.id, walletAddress)

      const [progress, hooks, filters] = await Promise.all([
        getUserProgress(currentUser.id),
        getUserMemoryHooks(currentUser.id),
        getUserCategoryFilters(currentUser.id),
      ])

      return NextResponse.json({
        success: true,
        user: {
          id: currentUser.id,
          role: currentUser.role,
          show_english: currentUser.showEnglish ?? true,
          show_category_badges: currentUser.showCategoryBadges ?? false,
        },
        progress,
        memory_hooks: hooks,
        category_filters: filters,
      })
    }

    // Case 2: Wallet already linked to another user - merge data
    // Fetch all data from both users
    const [sourceProgress, targetProgress, sourceHooksRaw, targetHooksRaw, sourceFilters, targetFilters] =
      await Promise.all([
        getUserProgress(currentUser.id),
        getUserProgress(existingWalletUser.id),
        getUserMemoryHooks(currentUser.id),
        getUserMemoryHooks(existingWalletUser.id),
        getUserCategoryFilters(currentUser.id),
        getUserCategoryFilters(existingWalletUser.id),
      ])

    const merged = mergeUserData({
      sourceProgress,
      targetProgress,
      sourceHooks: sourceHooksRaw,
      targetHooks: targetHooksRaw,
      sourceFilters,
      targetFilters,
    })

    // Apply all merge operations in a transaction for data consistency
    await db.transaction(async (tx) => {
      // Apply merged progress to target user
      const progressToUpsert = Object.entries(merged.mergedProgress).map(
        ([wordId, item]) => ({
          userId: existingWalletUser.id,
          wordId,
          stageIndex: item.stageIndex,
          knownCount: item.knownCount,
          unknownCount: item.unknownCount,
          lastKnownAt: item.lastKnownAt,
          lastUnknownAt: item.lastUnknownAt,
          nextDueAt: item.nextDueAt,
        })
      )
      if (progressToUpsert.length > 0) {
        await batchUpsertProgress(progressToUpsert)
      }

      // Apply merged hooks
      if (Object.keys(merged.mergedHooks).length > 0) {
        await batchUpsertMemoryHooks(existingWalletUser.id, merged.mergedHooks)
      }

      // Apply merged filters
      await setUserCategoryFilters(existingWalletUser.id, merged.mergedFilters)

      // Preserve the current device's role (the user is actively using this setting)
      await tx
        .update(users)
        .set({
          deviceId,
          role: currentUser.role,
          showEnglish: currentUser.showEnglish,
          showCategoryBadges: currentUser.showCategoryBadges,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingWalletUser.id))

      // Delete the source (anonymous) user - cascade will clean up related data
      await deleteUser(currentUser.id)
    })

    // Return merged data
    const [finalProgress, finalHooks, finalFilters] = await Promise.all([
      getUserProgress(existingWalletUser.id),
      getUserMemoryHooks(existingWalletUser.id),
      getUserCategoryFilters(existingWalletUser.id),
    ])

    return NextResponse.json({
      success: true,
      merged: true,
      user: {
        id: existingWalletUser.id,
        role: currentUser.role,
        show_english: currentUser.showEnglish ?? true,
        show_category_badges: currentUser.showCategoryBadges ?? false,
      },
      progress: finalProgress,
      memory_hooks: finalHooks,
      category_filters: finalFilters,
    })
  } catch (error) {
    console.error('Link wallet error:', error)
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to link wallet'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
