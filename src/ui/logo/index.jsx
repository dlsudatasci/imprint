export default function Logo({ subTitle, white }) {
  const logoHeight = 60;

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
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
            marginTop: `${logoHeight * .100}px`,
            marginTop: '4px',
          }}
        >
          {subTitle}
        </em>
      </div>
    </div>
  );
}
