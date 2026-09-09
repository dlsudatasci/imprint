import { cn } from '../cn';

/**
 * The Imprint wordmark: the glyph plus an optional text label.
 *
 * `src` is a prop rather than a fixed path because the image file belongs to
 * the host app, not to the component library. It defaults to Imprint's own
 * public path, so call sites in this app can leave it alone.
 */
export default function Logo({ subTitle, height = 40, src = '/images/logo/imprint.png' }) {
  const isWordmark = subTitle === 'Imprint';

  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Imprint"
        style={{ height: `${height}px` }}
        className="object-contain w-auto"
      />
      {subTitle && (
        <span
          className={cn(
            'leading-none',
            isWordmark
              ? 'font-display text-xl font-bold text-ink tracking-tight'
              : 'text-sm font-medium text-muted italic',
          )}
        >
          {subTitle}
        </span>
      )}
    </div>
  );
}
