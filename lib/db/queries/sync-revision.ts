import { eq, max, sql } from "drizzle-orm";
import { db } from "../client";
import { userMemoryHooks, userProgress, users } from "../schema";

/**
 * Returns the max(updatedAt) across the user's mutable rows. Used as the
 * `sync_revision` cursor in /api/sync responses so clients can ask
 * `?since=<this>` next time and only receive rows that changed afterwards.
 *
 * Category filters have no updatedAt column, so they're handled with
 * set-replace semantics on every delta — they don't influence the cursor.
 */
export async function getUserSyncRevision(userId: string): Promise<number> {
  const [userRow, progressRow, hookRow] = await Promise.all([
    db
      .select({ updatedAt: users.updatedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ value: max(userProgress.updatedAt) })
      .from(userProgress)
      .where(eq(userProgress.userId, userId)),
    db
      .select({ value: max(userMemoryHooks.updatedAt) })
      .from(userMemoryHooks)
      .where(eq(userMemoryHooks.userId, userId)),
  ]);

  const candidates = [
    userRow[0]?.updatedAt,
    progressRow[0]?.value,
    hookRow[0]?.value,
  ]
    .filter((d): d is Date => d instanceof Date)
    .map((d) => d.getTime());

  return candidates.length > 0 ? Math.max(...candidates) : Date.now();
}

/**
 * Deterministic signature of the user's hydratable list content.
 *
 * The signature includes the exact relevant-list membership, not just counts
 * and maximum timestamps. Replacing subscription A with B therefore always
 * changes the revision even when both lists have identical sizes and older
 * updated_at values. Item IDs cover inserts/deletes; item/list updated_at
 * covers edits; category values are included directly because that table has
 * no updated_at; referenced media fields cover audio source changes.
 */
export async function getContentRevision(userId: string): Promise<string> {
  const rows = await db.execute(sql`
    with relevant_lists as materialized (
      select list_id as id from user_list_subscriptions where user_id = ${userId}
      union
      select id from word_lists where owner_id = ${userId}
    ), relevant_items as materialized (
      select
        id, list_id, updated_at, known_audio_asset_id, audio_asset_id,
        source_item_id, takeover_source_item_id, text_known, text_target,
        ignore_case, accepted_known, accepted_target, notes, comment, address_form
      from word_list_items
      where list_id in (select id from relevant_lists)
        and text_known is not null
        and text_target is not null
    ), relevant_media as materialized (
      select distinct known_audio_asset_id as id from relevant_items
      where known_audio_asset_id is not null
      union
      select distinct audio_asset_id as id from relevant_items
      where audio_asset_id is not null
    )
    select 'v5:' || md5(concat_ws('|',
      coalesce((
        select jsonb_agg(
          jsonb_build_array(
            id, name, language_from, language_to, is_recommended, is_personal, updated_at
          )
          order by id
        )::text
        from word_lists where id in (select id from relevant_lists)
      ), '[]'),
      coalesce((
        select jsonb_agg(
          jsonb_build_array(
            id, list_id, updated_at, source_item_id, takeover_source_item_id,
            text_known, text_target, ignore_case, accepted_known,
            accepted_target, notes, comment, address_form,
            known_audio_asset_id, audio_asset_id
          )
          order by id
        )::text
        from relevant_items
      ), '[]'),
      coalesce((
        select jsonb_agg(jsonb_build_array(id, list_id, name, position) order by id)::text
        from word_categories where list_id in (select id from relevant_lists)
      ), '[]'),
      coalesce((
        select jsonb_agg(
          jsonb_build_array(
            id, storage_type, storage_provider, storage_ref, media_type,
            language, text_reference, provider, voice_id, size_bytes, created_at
          ) order by id
        )::text
        from media_assets where id in (select id from relevant_media)
      ), '[]')
    )) as revision
  `);
  const row = rows[0] as
    | { revision: string }
    | undefined;
  return row?.revision ?? "v5:empty";
}
