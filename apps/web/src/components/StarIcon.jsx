/**
 * One half-star-capable star glyph. `fillPercent` (0-100) drives how much of the
 * star is filled, so a 3.5 rating renders as three full stars and one half.
 *
 * Lives in its own module because both MediaPanel and TitleReview draw stars,
 * and a component importing it from the other would be a circular import.
 * Sizing comes from CSS (`.half-star-glyph--svg`), not a prop.
 */
export default function StarIcon({ fillPercent = 0 }) {
  return (
    <span className="half-star-glyph half-star-glyph--svg" aria-hidden="true">
      <svg className="half-star-svg half-star-empty" viewBox="0 0 24 24">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      <span className="half-star-fill half-star-fill--svg" style={{ width: `${fillPercent}%` }}>
        <svg className="half-star-svg" viewBox="0 0 24 24">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </span>
    </span>
  );
}
