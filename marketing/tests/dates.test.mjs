import test from 'node:test';
import assert from 'node:assert/strict';
import { mondayOfWeekInTz } from '../lib/dates.mjs';

test('mondayOfWeekInTz uses the Monday of the Australia week for Friday publish slots', () => {
  assert.equal(
    mondayOfWeekInTz(new Date('2026-06-25T23:30:00Z')),
    '2026-06-22',
  );
});

test('mondayOfWeekInTz snaps Sunday Sydney runs back to the same week Monday', () => {
  assert.equal(
    mondayOfWeekInTz(new Date('2026-06-21T02:00:00Z')),
    '2026-06-15',
  );
});
