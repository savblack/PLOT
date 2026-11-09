import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { linkSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { parseIssue, lintIssue, renderSubstack, renderEmail, renderIssueFile } =
  await import('../newsletter/render-issue.mjs');
const { issueDate, formatChart, buildPrompt, draftCodexArgs, draftBlockedPaths, readDraft } = await import('../newsletter/write-issue.mjs');
const { formatPeopleBrief, peopleOnPlotBrief, sqlFilters } = await import('../newsletter/people-on-plot.mjs');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const letter = `---
subject: Week of October 19
preview_text: Theater surprises, streaming returns, and a weekend worth planning.
date: 2026-10-19
author: plot
---

Other Mommy won last weekend on reviews that hated it. People went. That is the story until Sunday's grosses replace the estimate sitting in the trades.

### In theaters

*Whalefall* is the ticket worth buying. A diver goes looking for his father and a sperm whale swallows him, and the film is a clock from that moment. *Sense and Sensibility* is the other wide opening, a new pass at the Austen novel. *Other Mommy* is still playing.

### What everyone's talking about

Variety's review of *Street Fighter* says the movie comes apart once the tournament starts, which is the part a person buys the ticket for. The Friday audience prefers the fights. Read it before you trust either number, because both move: https://www.rottentomatoes.com/m/street_fighter_2026

The review itself is on Variety: https://variety.com/2026/film/reviews/street-fighter-123

One opening-night thread is still arguing the fights: https://www.reddit.com/r/movies/comments/abc123/whalefall_opening/

The same split showed up on Threads: https://www.threads.net/@films/post/ABC123

*Clayface* is the other argument this week. The reviews that are up landed in the same place, and the audience posts did too.

### Now on TV and Streaming

*Crystal Lake* arrived as a full season. *The Diplomat* came back the same week, also as a binge.

### Coming up

TRAILER: https://www.youtube.com/watch?v=mo7-mJ6wKho

*Clayface* opens Friday.

TRAILER: https://www.youtube.com/watch?v=dtr5JL1zkiM

*Wildwood* opens Friday.

TRAILER: https://www.youtube.com/watch?v=HP0BWBWn14I

*Wicker* opens Friday.

GIF: a ticket stub shrugs at a tomato.

[This weekend's four, in a list](https://theplot.tv/whats-on)

### The charts

Your trending top ten for October 19, 2026.

1. [Other Mommy](https://theplot.tv/movie/other-mommy-1400837)
2. [Whalefall](https://theplot.tv/movie/whalefall-1255833)
3. [Street Fighter](https://theplot.tv/movie/street-fighter-1153576)
4. [Crystal Lake](https://theplot.tv/tv/crystal-lake-213562)
5. [The Diplomat](https://theplot.tv/tv/the-diplomat-203857)

### Weekend watch

*Whalefall* is the one already in the letter to keep for the weekend. The survival half is the reason to go: https://www.latimes.com/entertainment-arts/movies/story/2026-10-15/whalefall-review

*Heat* just arrived for anyone who wants an older film on Netflix this weekend: https://example.com/heat-on-netflix

Add these to your watchlist before the weekend: [Whalefall](https://app.theplot.tv/save?media_type=movie&tmdb_id=1255833&src=newsletter) and [Heat](https://app.theplot.tv/save?media_type=movie&tmdb_id=949&src=newsletter)
Chart and title artwork: TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
`;

test('the Substack file is the letter, without the gif note', () => {
  const issue = parseIssue(letter);
  assert.deepEqual(lintIssue(issue), []);
  const posted = renderSubstack(issue);
  assert.match(posted, /^Other Mommy won last weekend/);
  assert.equal(posted.includes('subject:'), false);
  assert.equal(posted.includes('GIF:'), false);
  assert.equal(posted.includes('Build your watchlist'), false);
});

test('the email keeps the sentences and skips the old digest pitch', () => {
  const issue = parseIssue(letter);
  const html = renderEmail(issue);
  assert.match(html, /Other Mommy won last weekend on reviews that hated it\./);
  assert.match(html, /the week of October 19/);
  assert.match(html, /This weekend's four, in a list/);
  assert.match(html, /<ol/);
  assert.equal(html.includes('Build your watchlist'), false);
  assert.equal(html.includes('Save to your Plot'), false);
  assert.equal(html.includes('GIF:'), false);
  assert.match(html, /\{\{unsubscribe_url\}\}/);
  assert.match(html, /href="https:\/\/app\.theplot\.tv\/save\?media_type=movie&amp;tmdb_id=949&amp;src=newsletter"/);
  assert.equal(html.includes('&amp;amp;'), false);
});

test('the same source cannot carry two titles', () => {
  const doubled = letter.replace(
    'https://www.rottentomatoes.com/m/street_fighter_2026',
    'https://www.rottentomatoes.com/m/street_fighter_2026\n\nWhalefall is the other one: https://www.rottentomatoes.com/m/street_fighter_2026',
  );
  const problems = lintIssue(parseIssue(doubled));
  assert.equal(problems.some((line) => line.includes('more than once')), true);
});

test('a seventeenth Plot link is refused, and three is too few', () => {
  let extra = letter;
  for (let i = 0; i < 12; i += 1) extra += `\n\n[More ${i}](https://theplot.tv/movie/extra-${i})`;
  assert.equal(lintIssue(parseIssue(extra)).some((line) => line.includes('cap is 16')), true);
  const thin = letter
    .replace('[This weekend\'s four, in a list](https://theplot.tv/whats-on)\n\n', '')
    .replace(/https:\/\/theplot\.tv\/(?:movie|tv)\/[^\s)]+/g, 'https://example.com/title');
  assert.equal(lintIssue(parseIssue(thin)).some((line) => line.includes('at least 4')), true);
});

test('a letter with no gif slot is refused', () => {
  const bare = letter.replace('GIF: a ticket stub shrugs at a tomato.\n\n', '');
  assert.equal(lintIssue(parseIssue(bare)).some((line) => line.includes('meme or a gif')), true);
});

test('Weekend watch needs a sourced title and a matching save link', () => {
  const gone = letter.replace(/\n### Weekend watch[\s\S]*$/, '\n');
  assert.equal(lintIssue(parseIssue(gone)).some((line) => line.includes('Weekend watch')), true);
  const swapped = letter.replace('media_type=movie&tmdb_id=1255833', 'media_type=movie&tmdb_id=203857');
  assert.equal(lintIssue(parseIssue(swapped)).some((line) => line.includes('says movie')), true);
  const unsourced = letter
    .replace('https://www.latimes.com/entertainment-arts/movies/story/2026-10-15/whalefall-review', 'https://theplot.tv/movie/whalefall-1255833')
    .replace('https://example.com/heat-on-netflix', 'https://theplot.tv/movie/heat-949');
  assert.equal(lintIssue(parseIssue(unsourced)).some((line) => line.includes('source for why')), true);
  const oneSave = letter.replace(' and [Heat](https://app.theplot.tv/save?media_type=movie&tmdb_id=949&src=newsletter)', '');
  assert.equal(lintIssue(parseIssue(oneSave)).some((line) => line.includes('each title')), true);
  const sameList = letter.replace('*Heat* just arrived for anyone who wants an older film on Netflix this weekend', '*Clayface* is the other one for the weekend');
  assert.equal(lintIssue(parseIssue(sameList)).some((line) => line.includes('not the whole list')), true);
});

test('People on Plot is paused, and one title in a section cannot', () => {
  const back = letter.replace(
    '### The charts',
    '### People on Plot\n\nPeople opened Whalefall from search and saved Other Mommy. 4 people saved it.\n\n### The charts',
  );
  const problems = lintIssue(parseIssue(back));
  assert.equal(problems.some((line) => line.includes('paused')), true);
  assert.equal(problems.some((line) => line.includes('how many people')), true);
  const thin = letter.replace('*Sense and Sensibility* is the other wide opening, a new pass at the Austen novel. *Other Mommy* is still playing.', 'The other wide opening can wait.');
  assert.equal(lintIssue(parseIssue(thin)).some((line) => line.includes('In theaters')), true);
  const unnamed = letter.replace('Chart and title artwork: TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.', '');
  assert.equal(lintIssue(parseIssue(unnamed)).some((line) => line.includes('TMDB')), true);
});

test('a curly quote is refused', () => {
  const problems = lintIssue(parseIssue(letter.replace('People went.', 'People went. \u201cAnyway.\u201d')));
  assert.equal(problems.some((line) => line.includes('straight quotes')), true);
});

test('the blank template cannot render', () => {
  const template = readFileSync(join(root, 'marketing/newsletter/issue-template.md'), 'utf8');
  const problems = lintIssue(parseIssue(template));
  assert.equal(problems.some((line) => line.includes('WRITE THIS')), true);
  assert.equal(problems.some((line) => line.includes('WRITE THIS')), true);
});

test('a person\'s name on the byline is refused', () => {
  const problems = lintIssue(parseIssue(letter.replace('author: plot', 'author: Savannah Black')));
  assert.equal(problems.some((line) => line.includes('plot')), true);
});

test('a dash in the middle of a sentence is refused', () => {
  const problems = lintIssue(parseIssue(letter.replace('People went.', 'People went — anyway.')));
  assert.equal(problems.some((line) => line.includes('dash')), true);
});

test('house prose rules apply, with the letter exceptions', () => {
  const british = letter.replace('People went.', 'People went to the theatre.');
  assert.equal(lintIssue(parseIssue(british)).some((line) => line.includes('British')), true);
  const narrated = letter.replace('People went.', 'According to the trades, people went.');
  assert.equal(lintIssue(parseIssue(narrated)).some((line) => /according to/i.test(line)), true);
  const filler = letter.replace('People went.', 'Fun fact, people went.');
  assert.equal(lintIssue(parseIssue(filler)).some((line) => /fun fact/i.test(line)), true);
  const praised = letter.replace('People went.', 'Critics have praised the weekend.');
  assert.equal(lintIssue(parseIssue(praised)).some((line) => /critics have/i.test(line)), true);
  const criticsAre = letter.replace('People went.', 'Critics are against the weekend.');
  assert.equal(lintIssue(parseIssue(criticsAre)).some((line) => /critics are/i.test(line)), false);
  const bareAudience = letter.replace('People went.', 'It holds an audience score of 82 percent.');
  assert.equal(lintIssue(parseIssue(bareAudience)).some((line) => /audience score/i.test(line)), true);
  const gap = letter.replace(
    'People went.',
    'Destructoid reported a 45 percent critic score and an 82 percent audience score on October 16.',
  );
  assert.equal(lintIssue(parseIssue(gap)).some((line) => /audience score/i.test(line)), false);
  const tmdb = letter.replace('Other Mommy won', 'TMDB says Other Mommy won');
  assert.equal(lintIssue(parseIssue(tmdb)).some((line) => line.includes('TMDB')), true);
});

test('an assembled opener is refused', () => {
  const problems = lintIssue(parseIssue(letter.replace('Other Mommy won last weekend', 'In this issue, Other Mommy won last weekend')));
  assert.equal(problems.some((line) => line.includes('in this issue')), true);
});

test('the date-led title, opener order, and chart date are required', () => {
  const oldTitle = parseIssue(letter.replace('subject: Week of October 19', 'subject: Other Mommy took the weekend anyway'));
  assert.ok(lintIssue(oldTitle).some((line) => line.includes('Week of October 19')));
  const imageFirst = parseIssue(letter.replace(
    'Other Mommy won last weekend on reviews that hated it. People went. That is the story until Sunday\'s grosses replace the estimate sitting in the trades.',
    '![Featured artwork](https://example.com/featured.jpg)\n\nOther Mommy won last weekend on reviews that hated it. People went. That is the story until Sunday\'s grosses replace the estimate sitting in the trades.',
  ));
  assert.ok(lintIssue(imageFirst).some((line) => line.includes('Start with the overview')));
  const undatedChart = parseIssue(letter.replace('Your trending top ten for October 19, 2026.', 'Your trending top ten.'));
  assert.ok(lintIssue(undatedChart).some((line) => line.includes('Date the trending top ten')));
});

test('render writes the post and keeps the gif note beside it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'the-week-'));
  const path = join(dir, '2026-10-19.md');
  writeFileSync(path, letter);
  const out = renderIssueFile(path);
  const posted = readFileSync(out.substackPath, 'utf8');
  const html = readFileSync(out.emailPath, 'utf8');
  const notes = readFileSync(out.gifsPath, 'utf8');
  assert.match(posted, /^Other Mommy won last weekend/);
  assert.equal(posted.includes('GIF:'), false);
  assert.match(html, /Variety's review of <em>Street Fighter<\/em>/);
  assert.match(notes, /^GIF: a ticket stub/);
  assert.equal(html.includes('This week in film'), false);
  assert.equal(html.includes('GIF:'), false);
  const review = readFileSync(out.reviewPath, 'utf8');
  assert.match(review, /Production note/);
  assert.match(review, /GIF: a ticket stub/);
});

test('Saturday\'s draft is dated the coming Monday', () => {
  assert.equal(issueDate(new Date('2026-10-17T18:00:00Z')), '2026-10-19');
  assert.equal(issueDate(new Date('2026-10-19T15:00:00Z')), '2026-10-19');
});

test('the prompt tells the model to write the letter and to hide the machinery', () => {
  const prompt = buildPrompt({
    date: '2026-10-19',
    chart: '1. Other Mommy (film, New on the chart this week) https://theplot.tv/movie/other-mommy-1400837',
  });
  assert.match(prompt, /Savannah to review in Notion/);
  assert.match(prompt, /Nothing is copied to Brevo or sent until she approves/);
  assert.match(prompt, /Substack readers reject/);
  assert.match(prompt, /author is plot/);
  assert.match(prompt, /People on Plot is paused/);
  assert.match(prompt, /TMDB/);
  assert.match(prompt, /Reddit/);
  assert.match(prompt, /Threads/);
  assert.match(prompt, /Other Mommy/);
  assert.match(prompt, /GIF:/);
  assert.match(prompt, /at least four/i);
  assert.match(prompt, /Weekend watch/);
  assert.match(prompt, /watchlist/);
  assert.match(prompt, /do not mention how many people use Plot/i);
  assert.equal(prompt.includes('My Neighbor Totoro'), false);
  assert.equal(prompt.includes('a person will rewrite'), false);
});

test('a homepage, a missing thread, and a filter note are refused', () => {
  const home = lintIssue(parseIssue(letter.replace('https://variety.com/2026/film/reviews/street-fighter-123', 'https://www.paramount.com/')));
  assert.equal(home.some((line) => line.includes('homepage')), true);
  const noReddit = lintIssue(parseIssue(letter.replace(/https:\/\/www\.reddit\.com\/\S+/, 'https://www.reddit.com/r/movies/')));
  assert.equal(noReddit.some((line) => line.includes('Reddit')), true);
  const noThreads = lintIssue(parseIssue(letter.replace(/https:\/\/www\.threads\.net\/\S+/, 'https://www.threads.net/@films')));
  assert.equal(noThreads.some((line) => line.includes('Threads')), false);
  const filtered = `${letter}\nOnboarding picks are excluded.\n`;
  assert.equal(lintIssue(parseIssue(filtered)).some((line) => line.includes('filtered')), true);
});

test('the people brief is titles and a window, with no headcount', () => {
  const text = formatPeopleBrief({
    from: '2026-09-21',
    to: '2026-10-19',
    searches: [{ title: 'My Neighbor Totoro', year: '1988', kind: 'film' }],
    saves: [{ title: 'Brothers', year: '2026', kind: 'TV' }],
  });
  assert.match(text, /September 21 to October 18/);
  assert.match(text, /Do not say this week/);
  assert.match(text, /1\. My Neighbor Totoro \(film, 1988\)/);
  assert.match(text, /1\. Brothers \(TV, 2026\)/);
  assert.equal(text.includes('99'), false);
  assert.equal(/\b\d+\s+people\b/.test(text), false);
});

test('a quiet week falls back to the past month and still hides the count', async () => {
  const query = async (sql) => {
    if (sql.includes('2026-10-12')) return [];
    if (sql.includes('title_viewed')) return [['8392', 'movie', 99, 1, 't']];
    return [['250203', 'tv', 4, 2, 't']];
  };
  const resolveTitle = async (id) => (
    id === '8392'
      ? { title: 'My Neighbor Totoro', year: '1988', kind: 'film' }
      : { title: 'Brothers', year: '2026', kind: 'TV' }
  );
  const text = await peopleOnPlotBrief('2026-10-19', { query, resolveTitle, filters: async () => [] });
  assert.match(text, /My Neighbor Totoro/);
  assert.match(text, /Brothers/);
  assert.match(text, /Do not say this week/);
  assert.equal(text.includes('99'), false);
  assert.equal(text.includes(' 4'), false);
});

test('an email rule with a quote is dropped, a safe fragment is kept', () => {
  const sql = sqlFilters([
    { key: 'email', type: 'person', operator: 'not_icontains', value: "o'brien" },
    { key: 'email', type: 'person', operator: 'not_icontains', value: 'plot-sub-test-' },
  ]);
  assert.equal(sql.includes("o'brien"), false);
  assert.match(sql, /plot-sub-test-/);
  assert.match(sql, /COHORT 362972/);
});

test('codex drafts without a second sandbox', () => {
  const args = draftCodexArgs('PROMPT');
  assert.equal(args.at(-1), 'PROMPT');
  assert.equal(args.includes('--sandbox'), false);
  assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), true);
});

test('the chart brief is ranks and a real title url', () => {
  const text = formatChart([
    { rank: 1, title: 'Other Mommy', media_type: 'movie', tmdb_id: 1400837, movement_label: 'New on the chart this week' },
    { rank: 2, title: 'The Diplomat', media_type: 'tv', movement_label: 'Up 3 this week' },
  ]);
  assert.match(text, /^1\. Other Mommy \(film, New on the chart this week\) https:\/\/theplot\.tv\/movie\/other-mommy-1400837$/m);
  assert.match(text, /2\. The Diplomat \(TV, Up 3 this week\)$/m);
  assert.equal(text.includes('vote_average'), false);
});

test('the chart preview will not email anyone', () => {
  const env = { ...process.env };
  delete env.DRY_RUN;
  const result = spawnSync(process.execPath, ['marketing/newsletter/send-digest.mjs'], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /chart preview/);
  assert.match(result.stderr, /Substack/);
});

test('TMDB attribution stays in the last paragraph', () => {
  assert.deepEqual(lintIssue(parseIssue(letter)), []);
  const misplaced = letter.replace('Your trending top ten for October 19, 2026.', 'TMDB trending top ten for October 19, 2026.');
  assert.ok(lintIssue(parseIssue(misplaced)).some((line) => line.includes('only in the closing footnote')));
});

test('Coming up requires three titles', () => {
  const two = letter.replace('TRAILER: https://www.youtube.com/watch?v=HP0BWBWn14I\n\n*Wicker* opens Friday.\n\n', '');
  assert.ok(lintIssue(parseIssue(two)).some((line) => line.includes('Coming up needs at least 3 titles')));
});

test('every Coming up title has a trailer, which the review embeds and email renders as a clickable thumbnail', () => {
  const issue = parseIssue(letter);
  const review = renderEmail(issue, { review: true });
  const email = renderEmail(issue);
  for (const id of ['mo7-mJ6wKho', 'dtr5JL1zkiM', 'HP0BWBWn14I']) {
    assert.match(review, new RegExp(`youtube-nocookie.com/embed/${id}`));
    assert.match(email, new RegExp(`i.ytimg.com/vi/${id}/hqdefault.jpg`));
  }
  assert.equal(email.includes('<iframe'), false);
  assert.equal(renderSubstack(issue).includes('TRAILER:'), false);
});

test('Coming up rejects a missing trailer or promotional image', () => {
  const withoutTrailer = parseIssue(letter.replace('TRAILER: https://www.youtube.com/watch?v=dtr5JL1zkiM\n\n', ''));
  assert.ok(lintIssue(withoutTrailer).some((line) => line.includes('Every Coming up title needs one official YouTube trailer')));
  const withArtwork = parseIssue(letter.replace(
    'TRAILER: https://www.youtube.com/watch?v=dtr5JL1zkiM',
    '![Wildwood promotional backdrop](https://image.tmdb.org/t/p/w780/wildwood.jpg)',
  ));
  assert.ok(lintIssue(withArtwork).some((line) => line.includes('Coming up uses trailer embeds')));
});

test('In theaters requires three titles', () => {
  const two = letter.replace(' *Other Mommy* is still playing.', '');
  assert.ok(lintIssue(parseIssue(two)).some((line) => line.includes('In theaters needs at least 3 titles')));
});

test('every issue needs a concise Substack preview kept outside the article', () => {
  const missing = parseIssue(letter.replace(/^preview_text:.*\n/m, ''));
  assert.ok(lintIssue(missing).some((x) => x.includes('preview_text')));
  const issue = parseIssue(letter);
  assert.equal(renderSubstack(issue).includes(issue.previewText), false);
  assert.ok(renderEmail(issue).includes(issue.previewText));
  assert.ok(lintIssue({ ...issue, previewText: 'x'.repeat(161) }).some((x) => x.includes('preview_text')));
});

test('the draft sandbox denies the directory a symlinked .env resolves to', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'week-env-')));
  const repo = join(base, 'worktree');
  const main = join(base, 'main');
  mkdirSync(repo);
  mkdirSync(main);
  writeFileSync(join(main, '.env'), 'SECRET=1\n');
  symlinkSync(join(main, '.env'), join(repo, '.env'));
  assert.deepEqual(draftBlockedPaths(repo), [repo, main]);
  assert.deepEqual(draftBlockedPaths(main), [main]);
});

test('a symlinked or hard-linked issue.md is refused rather than copied', () => {
  const dir = mkdtempSync(join(tmpdir(), 'week-draft-'));
  writeFileSync(join(dir, 'outside.md'), 'not the draft');
  symlinkSync(join(dir, 'outside.md'), join(dir, 'issue.md'));
  assert.throws(() => readDraft(join(dir, 'issue.md')), /not a regular file/);
  linkSync(join(dir, 'outside.md'), join(dir, 'hard.md'));
  assert.throws(() => readDraft(join(dir, 'hard.md')), /not a regular file/);
  writeFileSync(join(dir, 'real.md'), 'draft');
  assert.equal(readDraft(join(dir, 'real.md')), 'draft');
});

test('a named pipe issue.md is refused without waiting for a writer', { timeout: 5000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'week-fifo-'));
  const fifo = join(dir, 'issue.md');
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
  assert.throws(() => readDraft(fifo), /not a regular file/);
});
