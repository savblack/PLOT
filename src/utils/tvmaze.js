function normalizeTitle(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getPremieredYear(value) {
  return typeof value === 'string' ? value.slice(0, 4) : '';
}

function getCountryCode(show) {
  return (
    show?.network?.country?.code
    || show?.webChannel?.country?.code
    || ''
  ).toUpperCase();
}

export function pickBestTvmazeShowMatch(results = [], details = {}) {
  const titles = new Set(
    [details?.name, details?.original_name]
      .map(normalizeTitle)
      .filter(Boolean)
  );
  const firstAirYear = getPremieredYear(details?.first_air_date);
  const originCountries = new Set(
    (details?.origin_country || [])
      .map(country => String(country || '').toUpperCase())
      .filter(Boolean)
  );

  const ranked = results
    .map(result => {
      const show = result?.show;
      const normalizedName = normalizeTitle(show?.name);
      if (!show?.id || !titles.has(normalizedName)) return null;

      const premieredYear = getPremieredYear(show?.premiered);
      const countryCode = getCountryCode(show);
      const yearMatches = Boolean(firstAirYear && premieredYear && firstAirYear === premieredYear);
      const countryMatches = Boolean(countryCode && originCountries.has(countryCode));

      let score = 4;
      if (yearMatches) score += 2;
      if (countryMatches) score += 1;

      return {
        score,
        yearMatches,
        countryMatches,
        show,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) {
    return { match: null, reason: 'no-exact-title-match' };
  }

  const ambiguousPeer = ranked.find(candidate =>
    candidate.show.id !== best.show.id
    && candidate.score === best.score
    && candidate.yearMatches === best.yearMatches
    && candidate.countryMatches === best.countryMatches
  );

  if (ambiguousPeer) {
    return { match: null, reason: 'ambiguous-match' };
  }

  return { match: best.show, reason: 'matched' };
}
