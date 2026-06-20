import { redirect } from 'next/navigation';

// The legacy `/edit` editor operated on the dropped `words` table. List editing
// now lives at `/lists` (see CLAUDE.md). Keep the route as a redirect so old
// links and editor bookmarks land on the current editor.
export default function EditPage() {
  redirect('/lists');
}
