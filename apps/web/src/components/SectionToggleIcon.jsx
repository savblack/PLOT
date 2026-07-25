export default function SectionToggleIcon({ collapse }) {
  return collapse ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 10h-6V4M21 3l-7 7M4 14h6v6M3 21l7-7" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 3h6v6M21 3l-7 7M9 21h-6v-6M3 21l7-7" />
    </svg>
  );
}
