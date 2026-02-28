import { NextRequest, NextResponse } from 'next/server'
import {
  getUserByDeviceId,
  getUserById,
  getUserByWalletAddress,
  linkAccountToUser,
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
      if (email != null || authProvider != null) {
        await updateUserFields(currentUser.id, {
          ...(email != null && String(email).trim() !== '' && { email: String(email).trim() }),
          ...(authProvider != null && String(authProvider).trim() !== '' && { authProvider: String(authProvider).trim() }),
        })
      }
      const updatedUser = await getUserByDeviceId(deviceId).then((u) => u ?? currentUser)
      const [progress, hooks, filters] = await Promise.all([
        getUserProgress(updatedUser.id),
        getUserMemoryHooks(updatedUser.id),
        getUserCategoryFilters(updatedUser.id),
      ])

      return NextResponse.json({
        success: true,
        user: {
          id: updatedUser.id,
          role: updatedUser.role,
          show_english: updatedUser.showEnglish ?? true,
          show_category_badges: updatedUser.showCategoryBadges ?? false,
          wallet_address: updatedUser.walletAddress ?? walletAddress,
          email: updatedUser.email ?? null,
          auth_provider: updatedUser.authProvider ?? null,
        },
        progress,
        memory_hooks: hooks,
        category_filters: filters,
      })
    }

    // Check if wallet is linked to a different user (cross-device merge case)
    const existingWalletUser = await getUserByWalletAddress(walletAddress)

    if (!existingWalletUser) {
      // Case 1: Fresh link - add wallet and optionally email/authProvider to current user
      await linkAccountToUser(currentUser.id, {
        walletAddress,
        email: email ?? undefined,
        authProvider: authProvider ?? undefined,
      })

      const linkedUser = await getUserByDeviceId(deviceId).then((u) => u ?? currentUser)
      const [progress, hooks, filters] = await Promise.all([
        getUserProgress(linkedUser.id),
        getUserMemoryHooks(linkedUser.id),
        getUserCategoryFilters(linkedUser.id),
      ])

      return NextResponse.json({
        success: true,
        user: {
          id: linkedUser.id,
          role: linkedUser.role,
          show_english: linkedUser.showEnglish ?? true,
          show_category_badges: linkedUser.showCategoryBadges ?? false,
          wallet_address: linkedUser.walletAddress ?? walletAddress,
          email: linkedUser.email ?? null,
          auth_provider: linkedUser.authProvider ?? null,
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

    // Apply merge operations sequentially. These use independent DB calls
    // (not wrapped in a transaction) which is acceptable for a language
    // learning app — worst case on partial failure is duplicated progress
    // that can be re-merged on next sign-in.

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

    // Preserve the current device's role and optionally update email/authProvider.
    // IMPORTANT: deviceId is UNIQUE, so we must clear it on the source user
    // before assigning it to the target merged user to avoid a unique
    // constraint violation when both rows temporarily share the same value.
    if (currentUser.deviceId === deviceId) {
      await updateUserFields(currentUser.id, { deviceId: null })
    }

    await updateUserFields(existingWalletUser.id, {
      deviceId,
      role: currentUser.role,
      showEnglish: currentUser.showEnglish,
      showCategoryBadges: currentUser.showCategoryBadges,
      ...(email != null && String(email).trim() !== '' && { email: String(email).trim() }),
      ...(authProvider != null && String(authProvider).trim() !== '' && { authProvider: String(authProvider).trim() }),
    })

    // Delete the source (anonymous) user - cascade will clean up related data
    await deleteUser(currentUser.id)

    // Return merged data
    const mergedUser = await getUserById(existingWalletUser.id).then((u) => u ?? existingWalletUser)
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
        role: currentUser.role,
        show_english: currentUser.showEnglish ?? true,
        show_category_badges: currentUser.showCategoryBadges ?? false,
        wallet_address: mergedUser.walletAddress ?? walletAddress,
        email: mergedUser.email ?? null,
        auth_provider: mergedUser.authProvider ?? null,
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
