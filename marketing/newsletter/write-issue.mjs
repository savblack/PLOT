// Drafts one issue of the week with the same copy-worker CLI that writes
// What's On. The model writes the letter. render-issue.mjs then checks it
// and emits the Substack post and the email preview. Nothing is sent.
import { spawnSync } from 'node:child_process';
import { closeSync, constants, copyFileSync, fstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, datePartsInTz } from '../lib/dates.mjs';
import { runCli, availableRunners, copyWorkerEnv, copyWorkerSandboxProfile } from '../lib/cli-runner.mjs';
import { getSupabase } from '../lib/supabase.mjs';
import { recentSnapshots, withMovement } from '../lib/trending.mjs';
import { lintIssue, parseIssue, renderIssueFile } from './render-issue.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DAYS_TO_MONDAY = { Monday: 0, Tuesday: 6, Wednesday: 5, Thursday: 4, Friday: 3, Saturday: 2, Sunday: 1 };

export function issueDate(now = new Date()) {
  const { date, weekday } = datePartsInTz(now);
  return addDays(date, DAYS_TO_MONDAY[weekday] ?? 0);
}

// Same slug the public title page canonicalises to.
const slugifyTitle = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'title';

export function plotTitleUrl(item) {
  const id = Number(item?.tmdb_id);
  if (!Number.isInteger(id) || id <= 0) return '';
  if (item.media_type !== 'movie' && item.media_type !== 'tv') return '';
  return `https://theplot.tv/${item.media_type}/${slugifyTitle(item.title)}-${id}`;
}

export function formatChart(items) {
  if (!items?.length) return 'No TMDB trending snapshot was available.';
  return items.slice(0, 10).map((item) => {
    const kind = item.media_type === 'tv' ? 'TV' : 'film';
    const move = item.movement_label ? `, ${item.movement_label}` : '';
    const url = plotTitleUrl(item);
    return `${item.rank}. ${item.title} (${kind}${move})${url ? ` ${url}` : ''}`;
  }).join('\n');
}

// TMDB trending, with the public title URL for each row. The letter lists this
// as TMDB trending. It is not what people did on Plot.
export async function chartBrief() {
  const snaps = await recentSnapshots(getSupabase(), 2);
  const items = snaps[0]?.items ? withMovement(snaps[0].items, snaps[1]?.items || null) : [];
  if (!items.length) throw new Error('No TMDB trending snapshot was available.');
  const dated = snaps[0]?.snapshot_date ? `Snapshot date: ${snaps[0].snapshot_date}.` : '';
  return [
    'Trending chart, already checked. List these titles under The charts and call it the trending chart. Do not write the word TMDB in that section. Name TMDB only in image captions and the closing attribution footnote. It names TMDB as the source of the chart and the artwork. Link each title with the URL on its row. Do not invent a slug. Do not include a TMDB score.',
    'The chart page, when you send the reader to the full list: https://theplot.tv/whats-on/chart',
    'A save link belongs in Weekend watch, for a title that section just gave the reader a reason to keep: https://app.theplot.tv/save?media_type=movie&tmdb_id=ID&src=newsletter with that title\'s media_type and the id at the end of its row. Not on a chart row. Do not reuse an id for a different title.',
    dated,
    formatChart(items),
  ].filter(Boolean).join('\n');
}

// Codex applies its own sandbox. Inside the copy-worker sandbox that second
// sandbox-exec is not permitted, so the model cannot read the contract.
// This call keeps the outer sandbox, which denies the repo, and turns Codex's off.
export function draftCodexArgs(prompt) {
  return ['exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--ephemeral', prompt];
}

const runDraft = (runner, prompt, { cwd, blockedPaths }) => {
  if (runner !== 'codex') {
    runCli('Draft the week', runner, prompt, {}, {
      cwd,
      blockedPaths,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    return;
  }
  console.log('\n== Draft the week (codex) ==');
  const result = spawnSync('sandbox-exec', [
    '-p', copyWorkerSandboxProfile(blockedPaths),
    'codex',
    ...draftCodexArgs(prompt),
  ], {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: copyWorkerEnv(process.env),
  });
  if (result.status !== 0) {
    throw new Error(`Draft the week failed with exit code ${result.status ?? 1}`);
  }
};

export function buildPrompt({ date, chart }) {
  return [
    `Write the Monday letter for ${date}.`,
    'Read THE-WEEK.md and VOICE.md in this directory. They are the contract.',
    'You draft the letter for Savannah to review in Notion. Nothing is copied to Brevo or sent until she approves. Deliver polished prose rather than relying on her to rewrite it.',
    'Substack readers reject a letter that sounds assembled. The contract is how you avoid that. Do not mention a model.',
    'Set subject exactly to Week of Month Day, using the issue date. It is both the Substack title and the email subject. Include preview_text in front matter for every issue: one lively, specific sentence of at most 160 characters covering two or three issue highlights, without repeating the date-led subject or claiming facts outside the issue. It is the Substack description and email preheader. Save the same text in the Notion Substack preview property alongside the review draft.',
    'Write issue.md in this directory and no other file. Do not turn in a file you already know will fail.',
    `Front matter date is ${date}. Front matter author is plot.`,
    'People on Plot is paused. Do not include that section. Do not mention how many people use Plot.',
    'Trending chart, already checked. List these titles under The charts. Introduce the trending top ten plainly for the issue date, as Your trending top ten for Month Day, Year. Put the full top 20 link after the tenth row. Do not explain where it is displayed or distinguish it from Plot user activity. Name TMDB in image-source captions and the closing footnote only, which is the last paragraph and names TMDB as the source of the chart and the artwork. Use the Plot URL on each row. Copy the movement words from the brief. Do not invent a slug or a TMDB id. Do not include a TMDB score. Do not type an em dash or an en dash anywhere in the file:',
    chart,
    'If PREVIOUS.md exists, repair that draft while preserving the latest approved headings and editorial choices. Reopen sources for facts you retain. Replace unsupported claims. Do not reinstate an older title list or recommendation.',
    'Open with an overview of the issue, not only the headline film. Make it the first block after front matter, before the featured artwork and its caption. Synthesize the conversation into a reader-focused editorial; do not march through this critic said, then that critic said. Distinguish actor from character. Introduce an older pick through a viewing idea, never For an older companion. Only include readable, useful social posts.',
    'Hyphenate a compound modifier. A streaming title names the US service a page you opened names. Do not tell the reader a check came up empty. Cut a sentence that states nothing.',
    'What everyone\'s talking about is the heading. It is about volume. For each title, say whether heaps of people are for it or against it, whether critics are for it or against it, or that the reviews are genuinely divided. One review is one critic. Identify the publication, and name the reviewer when their particular argument matters. Do not write "critics" unless you opened more than one review and they agree, or a roundup says so. One Threads post is one viewer. It can illustrate a wider reaction. It cannot be the whole case, and it cannot make a divide by itself. Do not tell the reader to save the ticket off one critic and one viewer. Do not call the section The argument.',
    'In theaters and Coming up each need at least three distinct titles. Every Coming up title gets an official YouTube TRAILER: line directly before its paragraph. The review will embed it and email will use its linked thumbnail. Do not use promotional images or a second trailer link in Coming up. Keep In theaters brief and vary how entries begin. Include box-office figures only when they add an interesting angle, not for every film. High-level reception alone can be enough. Any included figures need dates, territories, and preview/estimate labels. What everyone is talking about includes at least one TV or streaming conversation and does not repeat the theater lineup. Put new series and films before returning seasons in Now on TV and Streaming. In theaters, Now on TV and Streaming, What everyone\'s talking about, and Weekend watch each need more than one title. One title in a section is too little. Italicize each title. Each title needs its own source URL.',
    'Weekend watch recommends what to watch on the coming weekend. Mostly new titles. An older title only when the same paragraph ties it to a newer release, or a page you opened says a US service just added it, or says it leaves after this Monday. At most one title may already appear earlier in the letter, and only with a different reason. The others are new to the letter. Do not repeat Coming up. Do not repeat a review. Close with a warm, playful watchlist invitation that gives Friday a plan and avoids endless scrolling. Do not reuse a generic closing line. Every title in the section gets its own save link, https://app.theplot.tv/save?media_type=movie&tmdb_id=ID&src=newsletter. The id is the number at the end of a title URL in the chart brief, or a verified TMDB API search response, or the number in a themoviedb.org title URL you opened this run. Do not guess. Do not reuse a chart id for a different title. Do not put a save link on a chart row. Weekend watch adds no more than four Plot links. If you cannot open an id, pick a different title.',
    'Leave at least one GIF: production note, and no more than three. Savannah selects the GIF; do not generate or insert one. Do not invent an image URL.',
    'Link back to theplot.tv or app.theplot.tv at least four times, and no more than sixteen. Use the URLs in the chart brief for the chart. A save link is for a title the letter just gave the reader a reason to keep. Do not put one on every row.',
    'The letter needs a Reddit thread you opened and a critic review on the publication\'s own site. A homepage does not count, including a Disney+, Netflix, Hulu, Prime Video, or Apple TV homepage. A Rotten Tomatoes score page does not count as the critic. An editorial that quotes several reviews can show where critics landed, and you still need the publication review. Open each page and read the headline. Every title that sentence credits to the link has to be named on that page. A release calendar confirms a date, not a plot. Use each source URL once. Do not cite https://apnews.com/article/4d6ff25ef006c824bf124a9c9a6bcdb5 for any title other than Moana, Modern Warfare 4, a Dolly Parton tribute, Lupin, or John Legend. Do not write the word onboarding. Do not guess a TMDB id.',
    'Every other gross, score, date, and platform has to come from a page you open during this run. If you cannot open the page, leave the number out.',
  ].join('\n\n');
}

const repoRoot = () => {
  try {
    return realpathSync(ROOT);
  } catch {
    return ROOT;
  }
};

// The runner reads third-party pages, so treat what it can reach as exposed.
// Deny the repo and, because a worktree's .env is a symlink into the main
// checkout, the directory the .env actually resolves to.
export function draftBlockedPaths(root = repoRoot()) {
  const blocked = [root];
  try {
    const envDir = dirname(realpathSync(join(root, '.env')));
    if (!blocked.includes(envDir)) blocked.push(envDir);
  } catch {
    // No .env: nothing more to deny.
  }
  return blocked;
}

// The runner could leave issue.md as a symlink or a hard link to a file it
// cannot read itself. Open it once without following links, check that
// descriptor, and read from it, so a swap between the check and the read
// cannot point this process somewhere else.
export function readDraft(path) {
  if (!existsSync(path)) throw new Error('The runner finished without writing issue.md.');
  let fd;
  try {
    // O_NONBLOCK so a named pipe opens at once and fails the check below
    // instead of waiting for a writer.
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    throw new Error('issue.md is not a regular file. Refusing to read it.');
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('issue.md is not a regular file. Refusing to read it.');
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

export async function writeIssue({ date = issueDate(), runner } = {}) {
  const chosen = runner || availableRunners()[0];
  if (!chosen) throw new Error('No copy runner installed. Install the codex or claude CLI.');
  const chart = await chartBrief();
  const dir = mkdtempSync(join(tmpdir(), 'plot-week-'));
  const blocked = draftBlockedPaths();
  try {
    copyFileSync(join(HERE, 'THE-WEEK.md'), join(dir, 'THE-WEEK.md'));
    copyFileSync(join(HERE, '..', 'VOICE.md'), join(dir, 'VOICE.md'));
    writeFileSync(join(dir, 'BRIEF.md'), chart);
    const previous = join(HERE, 'issues', `${date}.md`);
    if (existsSync(previous)) copyFileSync(previous, join(dir, 'PREVIOUS.md'));
    runDraft(chosen, buildPrompt({ date, chart }), { cwd: dir, blockedPaths: blocked });
    const draft = readDraft(join(dir, 'issue.md'));
    const issue = parseIssue(draft);
    const problems = lintIssue(issue);
    if (problems.length) {
      writeFileSync(join(tmpdir(), 'the-week-failed.md'), draft);
      throw new Error(`Draft failed the Substack check:\n${problems.join('\n')}`);
    }
    const issuesDir = join(HERE, 'issues');
    mkdirSync(issuesDir, { recursive: true });
    const path = join(issuesDir, `${date}.md`);
    writeFileSync(path, draft);
    const rendered = renderIssueFile(path);
    return { path, ...rendered };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith('write-issue.mjs');
if (isMain) {
  const dateFlag = process.argv.indexOf('--date');
  const runnerFlag = process.argv.indexOf('--runner');
  writeIssue({
    date: dateFlag === -1 ? issueDate() : process.argv[dateFlag + 1],
    runner: runnerFlag === -1 ? undefined : process.argv[runnerFlag + 1],
  }).then((out) => {
    console.log(out.path);
    console.log(out.substackPath);
    console.log(out.emailPath);
    if (out.gifsPath) console.log(out.gifsPath);
  }).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
