import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextStatus, postHasCards, postNeedsCards, queueBlockReason, renderAction, saveExitAction,
} from '../lib/pipelineGate.mjs';

const copy = { x: 'Hello', instagram: 'Hello', threads: 'Hello' };
const cards = [{ portrait_path: 'id/card-0-portrait.jpg', landscape_path: 'id/card-0-landscape.jpg' }];

const row = (overrides) => ({
  post_type: 'countdown',
  status: 'copy_ready',
  copy,
  media: null,
  ...overrides,
});

test('card types need both crops, questions and guides do not', () => {
  assert.equal(postNeedsCards(row({})), true);
  assert.equal(postNeedsCards(row({ post_type: 'hidden_gem' })), true);
  assert.equal(postNeedsCards(row({ post_type: 'trailer' })), true);
  assert.equal(postNeedsCards(row({ post_type: 'trending' })), true);
  assert.equal(postNeedsCards(row({ post_type: 'question' })), false);
  assert.equal(postNeedsCards(row({ post_type: 'guide' })), false);
  assert.equal(postHasCards(row({ media: cards })), true);
  assert.equal(postHasCards(row({ media: [] })), false);
  assert.equal(postHasCards(row({ media: [{ portrait_path: 'p.jpg' }] })), false);
  assert.equal(postHasCards(row({})), false);
});

test('a card post with no media is not queued', () => {
  assert.equal(queueBlockReason(row({})), 'missing_cards');
  assert.equal(queueBlockReason(row({ status: 'approved', media: [] })), 'missing_cards');
  assert.equal(queueBlockReason(row({ media: cards })), null);
});

test('guides are queued without cards, and question posts are not sent', () => {
  assert.equal(queueBlockReason(row({ post_type: 'guide', media: null })), null);
  assert.equal(queueBlockReason(row({ post_type: 'question', media: null })), 'questions_off');
  assert.equal(queueBlockReason(row({ post_type: 'question', media: [] })), 'questions_off');
  assert.equal(queueBlockReason(row({ post_type: 'question', media: cards })), 'questions_off');
});

test('copy_ready card posts render, and approved card posts render without losing approval', () => {
  assert.equal(renderAction(row({})), 'generate');
  assert.equal(renderAction(row({ status: 'approved' })), 'generate');
  assert.equal(renderAction(row({ status: 'approved', media: [] })), 'generate');
  assert.equal(renderAction(row({ status: 'needs_review' })), 'generate');
  assert.equal(renderAction(row({ status: 'failed' })), 'generate');
  assert.equal(nextStatus(row({ status: 'approved' })), 'approved');
  assert.equal(nextStatus(row({ status: 'copy_ready' })), 'needs_review');
  assert.equal(nextStatus(row({ status: 'failed' })), 'needs_review');
});

test('a card post that already has files is not rendered again', () => {
  assert.equal(renderAction(row({ status: 'approved', media: cards })), 'skip');
  assert.equal(renderAction(row({ status: 'needs_review', media: cards })), 'skip');
  assert.equal(renderAction(row({ status: 'generated', media: cards })), 'promote');
  assert.equal(renderAction(row({ status: 'copy_ready', media: cards })), 'promote');
});

test('question posts are left alone, and guides finish only while they are still early', () => {
  assert.equal(renderAction(row({ post_type: 'question', status: 'copy_ready' })), 'skip');
  assert.equal(renderAction(row({ post_type: 'question', status: 'approved' })), 'skip');
  assert.equal(renderAction(row({ post_type: 'question', status: 'needs_review' })), 'skip');
  assert.equal(renderAction(row({ post_type: 'question', status: 'failed' })), 'skip');
  assert.equal(renderAction(row({ post_type: 'guide', status: 'copy_ready' })), 'generate');
  assert.equal(renderAction(row({ post_type: 'guide', status: 'approved' })), 'skip');
});

test('planned, skipped, and published rows are left alone', () => {
  assert.equal(renderAction(row({ status: 'planned' })), 'skip');
  assert.equal(renderAction(row({ status: 'skipped' })), 'skip');
  assert.equal(renderAction(row({ status: 'published', media: null })), 'skip');
  assert.equal(renderAction(row({ copy: null })), 'skip');
});

test('a partial copy rejection still continues into render', () => {
  assert.equal(saveExitAction(0), 'continue');
  assert.equal(saveExitAction(1), 'continue_and_fail');
  assert.equal(saveExitAction(2), 'abort');
  assert.equal(saveExitAction(null), 'abort');
});
