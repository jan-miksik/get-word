import { forwardRef, type ImgHTMLAttributes } from 'react';
import { apiUrl } from '@/features/shared/http/api-runtime';

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  width?: number | string;
  height?: number | string;
  // Next-only knobs, accepted and ignored — there is no image optimizer here.
  unoptimized?: boolean;
  priority?: boolean;
  quality?: number;
  fill?: boolean;
  placeholder?: string;
  blurDataURL?: string;
  loader?: unknown;
};

/**
 * `next/image` for the native bundle: a plain `<img>`. Root-relative sources
 * are resolved against the API origin, because assets like `/icons/icon-192.png`
 * live on the web host, not inside the app bundle.
 */
const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  { src, unoptimized: _unoptimized, priority: _priority, quality: _quality, fill, placeholder: _placeholder, blurDataURL: _blurDataURL, loader: _loader, style, ...rest },
  ref,
) {
  const fillStyle = fill
    ? ({ position: 'absolute', inset: 0, width: '100%', height: '100%' } as const)
    : undefined;

  return (
    // This file *is* the replacement for `next/image`, and `alt` arrives with
    // the caller's props, which the rule cannot see.
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      ref={ref}
      src={apiUrl(src)}
      style={{ ...fillStyle, ...style }}
      {...rest}
    />
  );
});

export default Image;
