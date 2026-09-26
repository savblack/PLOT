import { useState } from 'react';
import { GUIDE_COUNTRIES, GUIDE_REGIONS, guideMarketsForCountry } from './broadcastGuide.js';

/** Shared first-run form. Suggest the account's country, never guess a TV market.
 * @param {ReturnType<import('./useBroadcastPreferences.js').useBroadcastPreferences>} preferences
 * @param {string | null | undefined} profileRegion
 */
export function useBroadcastSetup(preferences, profileRegion) {
  const savedMarket = GUIDE_REGIONS.find(m => m.id === preferences.value.market_id);
  const [country, setCountry] = useState(savedMarket?.country || (GUIDE_COUNTRIES.includes(profileRegion ?? '') ? profileRegion : '') || '');
  const [region, setRegion] = useState(savedMarket?.id || '');
  const [error, setError] = useState(false);
  const market = GUIDE_REGIONS.find(m => m.id === region && m.country === country);
  const available = Boolean(market?.provider && market.scope !== 'unavailable');
  const canSave = available && !preferences.saving;

  function chooseCountry(value) {
    setCountry(value);
    setRegion('');
    setError(false);
  }
  function chooseRegion(value) {
    setRegion(value);
    setError(false);
  }
  async function save() {
    if (!canSave) return false;
    setError(false);
    const ok = await preferences.save({
      market_id: region,
      channel_ids: region === preferences.value.market_id ? preferences.value.channel_ids : null,
    });
    setError(!ok);
    return ok;
  }
  return { country, region, market, markets: guideMarketsForCountry(country), available, canSave, error, chooseCountry, chooseRegion, save };
}
