/* eslint-disable @next/next/no-img-element */
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
