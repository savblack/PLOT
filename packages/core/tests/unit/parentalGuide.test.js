import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearCertificationLists,
  loadCertificationMeaning,
  meaningFor,
  movieGuide,
  tvGuide,
} from '../../parentalGuide.js';

const releaseDates = {
  results: [
    {
      iso_3166_1: 'US',
      release_dates: [
        { type: 4, certification: 'PG-13', descriptors: ['Language'] },
        { type: 3, certification: 'PG-13', descriptors: ['Violence', 'Language', ''] },
        { type: 2, certification: '', descriptors: ['Fear'] },
      ],
    },
    {
      iso_3166_1: 'AU',
      release_dates: [
        { type: 4, certification: 'M', descriptors: [] },
        { type: 3, certification: '', descriptors: ['Violence'] },
      ],
    },
    {
      iso_3166_1: 'NL',
      release_dates: [
        { type: 3, certification: '12', descriptors: [] },
        { type: 4, certification: '12', descriptors: ['Violence', 'Coarse Language'] },
      ],
    },
  ],
};

test('movie guide prefers a theatrical certification and keeps advisories from the same rating', () => {
  assert.deepEqual(movieGuide(releaseDates, 'US'), {
    certification: 'PG-13',
    descriptors: ['Language', 'Violence'],
  });
  assert.deepEqual(movieGuide(releaseDates, 'NL'), {
    certification: '12',
    descriptors: ['Violence', 'Coarse Language'],
  });
});

test('movie guide uses a later release type when the preferred ones have no certification', () => {
  assert.deepEqual(movieGuide(releaseDates, 'AU'), {
    certification: 'M',
    descriptors: [],
  });
});

test('movie guide does not borrow another region', () => {
  assert.equal(movieGuide(releaseDates, 'FR'), null);
  assert.equal(movieGuide(null, 'US'), null);
});

test('series guide reads the region rating and its descriptors', () => {
  const ratings = {
    results: [
      { iso_3166_1: 'US', rating: 'TV-MA', descriptors: ['Violence', 'Language'] },
      { iso_3166_1: 'AU', rating: 'MA 15+', descriptors: [] },
      { iso_3166_1: 'GB', rating: '   ', descriptors: ['Language'] },
    ],
  };
  assert.deepEqual(tvGuide(ratings, 'US'), {
    certification: 'TV-MA',
    descriptors: ['Violence', 'Language'],
  });
  assert.deepEqual(tvGuide(ratings, 'AU'), { certification: 'MA 15+', descriptors: [] });
  assert.equal(tvGuide(ratings, 'GB'), null);
  assert.equal(tvGuide(ratings, 'FR'), null);
});

test('meaning is the official line for that region and certification', () => {
  const list = {
    certifications: {
      US: [
        { certification: 'PG', meaning: 'Parental guidance suggested.' },
        { certification: 'PG-13', meaning: '  Parents strongly cautioned.  ' },
      ],
    },
  };
  assert.equal(meaningFor(list, 'US', 'PG-13'), 'Parents strongly cautioned.');
  assert.equal(meaningFor(list, 'US', 'R'), null);
  assert.equal(meaningFor(list, 'AU', 'PG-13'), null);
  assert.equal(meaningFor(null, 'US', 'PG-13'), null);
});

test('the certification list is fetched once and a miss can be tried again', async () => {
  clearCertificationLists();
  let calls = 0;
  const client = {
    movieCertifications: async () => {
      calls += 1;
      return calls === 1 ? null : { certifications: { US: [{ certification: 'PG-13', meaning: 'Cautioned.' }] } };
    },
    tvCertifications: async () => null,
  };
  assert.equal(await loadCertificationMeaning(client, 'movie', 'US', 'PG-13'), null);
  assert.equal(await loadCertificationMeaning(client, 'movie', 'US', 'PG-13'), 'Cautioned.');
  assert.equal(await loadCertificationMeaning(client, 'movie', 'US', 'PG-13'), 'Cautioned.');
  assert.equal(calls, 2);
});
