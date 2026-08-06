import assert from 'node:assert/strict';
import test from 'node:test';

import { toggleLike, addComment, toggleCommentLike, editComment, deleteComment } from '../../usePostEngagement.js';

// Despite the filename, most of this module's exports are plain async
// functions, not React hooks — only usePostComments (not imported here) is an
// actual hook. Like userMedia.js, these functions call the real `supabase`
// singleton on their happy path with no injection seam, so only the guard
// clauses that return before touching supabase are covered here.

test('toggleLike short-circuits without a postId or a userId', async () => {
  assert.deepEqual(await toggleLike({ postId: null, userId: 'u1', liked: false }), { error: null });
  assert.deepEqual(await toggleLike({ postId: 'p1', userId: null, liked: false }), { error: null });
});

test('addComment short-circuits without a postId, a userId, or non-whitespace body text', async () => {
  assert.deepEqual(await addComment({ postId: null, userId: 'u1', body: 'hi' }), { data: null, error: null });
  assert.deepEqual(await addComment({ postId: 'p1', userId: null, body: 'hi' }), { data: null, error: null });
  assert.deepEqual(await addComment({ postId: 'p1', userId: 'u1', body: '   ' }), { data: null, error: null });
  assert.deepEqual(await addComment({ postId: 'p1', userId: 'u1', body: '' }), { data: null, error: null });
});

test('toggleCommentLike short-circuits without a commentId or a userId', async () => {
  assert.deepEqual(await toggleCommentLike({ commentId: null, userId: 'u1', liked: false }), { error: null });
  assert.deepEqual(await toggleCommentLike({ commentId: 'c1', userId: null, liked: false }), { error: null });
});

test('editComment short-circuits without a commentId, a userId, or non-whitespace body text', async () => {
  assert.deepEqual(await editComment({ commentId: null, userId: 'u1', body: 'hi' }), { data: null, error: null });
  assert.deepEqual(await editComment({ commentId: 'c1', userId: 'u1', body: '' }), { data: null, error: null });
  assert.deepEqual(await editComment({ commentId: 'c1', userId: 'u1', body: '   ' }), { data: null, error: null });
});

test('deleteComment short-circuits without a commentId', async () => {
  assert.deepEqual(await deleteComment({ commentId: null, userId: 'u1' }), { error: null });
});
