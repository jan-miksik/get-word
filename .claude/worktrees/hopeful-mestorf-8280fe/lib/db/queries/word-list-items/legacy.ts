import { db } from '../../client';
import { sql } from 'drizzle-orm';

export async function getWordIdToItemIdMapping(
  listId: string
): Promise<Map<string, string>> {
  const results = await db.execute(
    sql`SELECT w.id as word_id, wli.id as item_id
        FROM words w
        JOIN word_list_items wli ON wli.text_known = w.cz AND wli.list_id = ${listId}`
  );

  const mapping = new Map<string, string>();
  for (const row of results) {
    mapping.set(row.word_id as string, row.item_id as string);
  }
  return mapping;
}
