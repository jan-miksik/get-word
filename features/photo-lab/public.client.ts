/** Public lazy client entrypoint for embedding Photo Lab in another feature. */
export async function loadPhotoLabPage() {
  return import('./components/PhotoLabPage').then((module) => module.PhotoLabPage);
}
