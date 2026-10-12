import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLinearOperator } from '../../../../supabase/functions/_shared/linearOperator.js';

const operator = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

describe('Linear review authorization', () => {
  it('accepts only a configured comment author, even when the event actor differs', () => {
    const payload = { type: 'Comment', actor: { type: 'user', id: operator }, data: { userId: operator } };
    assert.equal(isLinearOperator(payload, ` ${operator},${other} `), true);
    assert.equal(isLinearOperator(payload, ''), false);
    assert.equal(isLinearOperator({ ...payload, data: { userId: other } }, operator), false);
    assert.equal(isLinearOperator({ ...payload, actor: { type: 'integration', id: other } }, operator), true);
    assert.equal(isLinearOperator({ ...payload, data: {} }, operator), false);
  });

  it('refuses an unconfigured user for issue state changes', () => {
    const payload = { type: 'Issue', actor: { type: 'user', id: other } };
    assert.equal(isLinearOperator(payload, operator), false);
    assert.equal(isLinearOperator({ ...payload, actor: { type: 'user', id: operator } }, operator), true);
  });
});
