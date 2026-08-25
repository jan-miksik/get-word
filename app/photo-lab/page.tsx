import { redirect } from 'next/navigation';

/**
 * The photo lab is no longer a screen of its own: it is a tab on "Add your own
 * words", beside typing and the conversation. Bookmarks and older links land
 * there instead of on a page that would duplicate the same flow.
 */
export default function PhotoLabRoute() {
  redirect('/?surface=photo');
}
