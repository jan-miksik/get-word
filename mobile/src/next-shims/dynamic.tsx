import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';

type Loader<P> = () => Promise<ComponentType<P> | { default: ComponentType<P> }>;

type DynamicOptions = {
  ssr?: boolean;
  loading?: ComponentType | (() => ReactNode);
};

/**
 * `next/dynamic` for the native bundle, on top of React.lazy. Callers pass
 * either a module namespace or the component itself (`.then((m) => m.Thing)`),
 * so both shapes are accepted.
 */
export default function dynamic<P extends object>(
  loader: Loader<P>,
  options: DynamicOptions = {},
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const loaded = await loader();
    return typeof loaded === 'function'
      ? { default: loaded }
      : (loaded as { default: ComponentType<P> });
  });

  const Loading = options.loading;

  return function DynamicComponent(props: P) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
