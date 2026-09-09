import React from 'react';

/**
 * SVG filter definitions behind Imprint's hand-drawn illustration style.
 *
 * `cr-rough` nudges whatever it is applied to out of true, so no line is quite
 * straight. `cr-b1`, `cr-b2` and `cr-b3` are the same effect at three different
 * noise seeds; the `crayon-boil` keyframes in globals.scss step between them so
 * outlines wobble the way hand-drawn animation does.
 *
 * Shared by the loading animation and the scene on the login page. Because
 * these apply through CSS `filter: url(#cr-rough)`, they work on a <canvas>
 * too, which is how the WebGL scene matches the illustrations.
 *
 * Mount once per page, above anything referencing the ids. Mounting twice is
 * harmless — the definitions are identical, so a repeated id resolves to the
 * same filter.
 */
export default function CrayonFilters() {
  const boil = (id: string, seed: number) => (
    <filter id={id} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves={2} seed={seed} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  );
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <filter id="cr-rough" x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.075 0.095" numOctaves={2} seed={5} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      {boil('cr-b1', 3)}
      {boil('cr-b2', 12)}
      {boil('cr-b3', 21)}
    </svg>
  );
}
