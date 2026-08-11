export interface ListPermissionSubject {
  id: string;
  userRole?: string | null;
}

export interface ListPermissionResource {
  ownerId: string | null;
  isCommon?: boolean | null;
  isPublic?: boolean | null;
}

export interface ListPermissionContext {
  list: ListPermissionResource;
  user: ListPermissionSubject;
  isSubscribed?: boolean;
  isBlocked?: boolean;
}

export interface ListPermissions {
  isOwner: boolean;
  canRead: boolean;
  canManageContent: boolean;
}

/** One policy for owner/editor/subscriber/block relationships. */
export function getListPermissions({
  list,
  user,
  isSubscribed = false,
  isBlocked = false,
}: ListPermissionContext): ListPermissions {
  const isOwner = list.ownerId === user.id;
  const canManageContent = isOwner || (Boolean(list.isCommon) && user.userRole === 'editor');
  const canRead = isOwner || (!isBlocked && (Boolean(list.isPublic) || isSubscribed || canManageContent));
  return { isOwner, canRead, canManageContent };
}

export function canManageListContent(
  list: ListPermissionResource | null | undefined,
  user: ListPermissionSubject,
): boolean {
  return Boolean(list && getListPermissions({ list, user }).canManageContent);
}
