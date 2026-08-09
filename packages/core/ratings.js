export const MAX_RATING = 10;
export const STAR_COUNT = 5;

export function normalizeRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return 0;
  return Math.min(MAX_RATING, Math.max(1, Math.round(rating)));
}

export function ratingToStars(value) {
  const rating = normalizeRating(value);
  return rating ? rating / 2 : 0;
}

// Inverse of ratingToStars: converts a 1-5 star count (e.g. a whole-star tap
// target such as mobile's StarRow) into the shared 1-10 stored scale.
export function starsToRating(stars) {
  const value = Number(stars);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return normalizeRating(value * 2);
}

export function starFillPercent(ratingValue, starIndex) {
  const rating = normalizeRating(ratingValue);
  const fullStep = starIndex * 2;
  if (rating >= fullStep) return 100;
  if (rating === fullStep - 1) return 50;
  return 0;
}

export function ratingFromPointer(event, starIndex) {
  const rect = event.currentTarget.getBoundingClientRect();
  const isLeftHalf = event.clientX - rect.left < rect.width / 2;
  return starIndex * 2 - (isLeftHalf ? 1 : 0);
}
