import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armFirstWin, dismissFirstWinCard, firstHomeTitle, firstWinCardVisible,
  parseFirstWinCard, serialiseFirstWinCard, suppressFirstWinImport,
} from '../../firstWinCard.js';

test('the home card is armed only when onboarding was not skipped', () => {
  const armed = armFirstWin({ skipped: false });
  assert.equal(firstWinCardVisible(armed), true);
  assert.equal(firstWinCardVisible(armFirstWin({ skipped: true })), false);
  assert.equal(firstWinCardVisible(dismissFirstWinCard(armed)), false);
  assert.equal(firstWinCardVisible(null), false);
});

test('a Trakt import hides the card, and another import does not', () => {
  const armed = armFirstWin();
  assert.equal(firstWinCardVisible(suppressFirstWinImport(armed, 'trakt')), false);
  assert.equal(firstWinCardVisible(suppressFirstWinImport(armed, 'trakt-export')), false);
  assert.equal(firstWinCardVisible(suppressFirstWinImport(armed, 'letterboxd')), true);
  assert.equal(suppressFirstWinImport(null, 'trakt'), null);
});

test('stored card state round-trips, and junk reads as no card', () => {
  const state = dismissFirstWinCard(armFirstWin());
  assert.deepEqual(parseFirstWinCard(serialiseFirstWinCard(state)), state);
  assert.equal(parseFirstWinCard(null), null);
  assert.equal(parseFirstWinCard('not json'), null);
  assert.equal(parseFirstWinCard('{"dismissed":true}'), null);
});

test('the card uses the first show still on the watchlist, then a movie', () => {
  const film = { tmdb_id: 22, media_type: 'movie', title: 'West' };
  const show = { tmdb_id: 11, media_type: 'tv', title: 'North', poster_path: '/n.jpg' };
  assert.deepEqual(firstHomeTitle([film, show]), {
    id: 11, media_type: 'tv', title: 'North', poster_path: '/n.jpg',
  });
  assert.deepEqual(firstHomeTitle([film]), {
    id: 22, media_type: 'movie', title: 'West', poster_path: null,
  });
  assert.equal(firstHomeTitle([]), null);
  assert.equal(firstHomeTitle(null), null);
  assert.equal(firstHomeTitle([{ id: 0, media_type: 'tv' }]), null);
});
