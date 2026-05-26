export default function PlotLoader() {
  return (
    <div
      aria-label="PLOT"
      style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '2rem',
        letterSpacing: '0.12em',
        display: 'flex',
        gap: 0,
        userSelect: 'none',
      }}
    >
      {['P', 'L', 'O', 'T'].map((letter, i) => (
        <span
          key={letter}
          style={{
            display: 'inline-block',
            animation: `plot-letter-pulse 2s ease-in-out infinite ${i * 0.3}s`,
            opacity: 0.18,
          }}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}
