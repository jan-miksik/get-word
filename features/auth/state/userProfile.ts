'use client';

import { useState, useCallback } from 'react';
import type { SyncResponse } from '@/lib/sync';

export function useUserProfile() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userWalletAddress, setUserWalletAddress] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRoleState] = useState<'user' | 'editor'>('user');

  const applyServerProfile = useCallback((user: SyncResponse['user']) => {
    if (user.id) setUserId(user.id);
    setUserWalletAddress(user.wallet_address ?? null);
    setUserEmail(user.email ?? null);
    if (user.user_role) {
      setUserRoleState(user.user_role);
      document.cookie = `get_word_user_role=${user.user_role};path=/;max-age=31536000;SameSite=Lax`;
    }
  }, []);

  return {
    userId,
    userWalletAddress,
    userEmail,
    userRole,
    isEditor: userRole === 'editor',
    applyServerProfile,
  };
}
