export default function SectionToggleIcon({ collapse }) {
  return collapse ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l7 7M3 9h6V3M21 21l-7-7M21 15h-6v6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 10 3 3M3 9V3h6M14 14l7 7M21 15v6h-6" />
    </svg>
  );
}
