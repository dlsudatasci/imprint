/* eslint-disable @next/next/no-img-element */
/**
 * The Human-X Interactions Lab logo, shown in the footer as the research group
 * behind Imprint.
 */
export default function HXIL() {
  const logoHeight = 60;
  return (
    <img
      src="/images/logo/hxil.png"
      alt="Logo"
      style={{
        height: `${logoHeight}px`,
        objectFit: 'contain',
      }
      }
    />
  );
}
