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
    const [sourceProgress, targetProgress, sourceHooksRaw, targetHooksRaw, sourceFilters, targetFilters] =
      await Promise.all([
        getUserProgress(currentUser.id),
        getUserProgress(existingWalletUser.id),
        getUserMemoryHooks(currentUser.id),
        getUserMemoryHooks(existingWalletUser.id),
        getUserCategoryFilters(currentUser.id),
        getUserCategoryFilters(existingWalletUser.id),
      ])

    // Convert full UserProgress records to ProgressMergeItem format
    const toMergeItems = (progressMap: Record<string, { stageIndex: number; knownCount: number; unknownCount: number; lastKnownAt: Date | null; lastUnknownAt: Date | null; nextDueAt: Date | null }>) => {
      const result: Record<string, { stageIndex: number; knownCount: number; unknownCount: number; lastKnownAt: Date | null; lastUnknownAt: Date | null; nextDueAt: Date | null }> = {}
      for (const [wordId, item] of Object.entries(progressMap)) {
        result[wordId] = {
          stageIndex: item.stageIndex,
          knownCount: item.knownCount,
          unknownCount: item.unknownCount,
          lastKnownAt: item.lastKnownAt,
          lastUnknownAt: item.lastUnknownAt,
          nextDueAt: item.nextDueAt,
        }
      }
      return result
    }

    const merged = mergeUserData({
      sourceProgress: toMergeItems(sourceProgress),
      targetProgress: toMergeItems(targetProgress),
      sourceHooks: sourceHooksRaw,
      targetHooks: targetHooksRaw,
      sourceFilters,
      targetFilters,
    })

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

    // Update target user's device_id to current device
    await db
      .update(users)
      .set({ deviceId, updatedAt: new Date() })
      .where(eq(users.id, existingWalletUser.id))

    // Delete the source (anonymous) user - cascade will clean up related data
    await deleteUser(currentUser.id)

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
        role: existingWalletUser.role,
        show_english: existingWalletUser.showEnglish ?? true,
        show_category_badges: existingWalletUser.showCategoryBadges ?? false,
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
