export default function Logo({ subTitle }) {
  const logoHeight = 60;

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo/imprint.png"
        alt="Logo"
        style={{
          height: `${logoHeight}px`,
          objectFit: 'contain',
          marginRight: '0.75rem',
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {/* <h1
          className={`text-[20px] leading-none m-0 font-bold ${
            white ? 'text-white' : 'text-primary'
          }`}
        >
          Imprint
        </h1> */}
        <em
          className="text-gray-500"
          style={{
            marginTop: '4px',
          }}
        >
          {subTitle}
        </em>
      </div>
    </div>
  );
}
