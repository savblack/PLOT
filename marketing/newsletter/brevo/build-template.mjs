// Builds the reusable HTML master without copying an unapproved issue.
import { writeFileSync } from 'node:fs';
import { renderEmail } from '../render-issue.mjs';
const body = [
  'FEATURED IMAGE: Replace this block with the hosted, branded cover for the approved issue.',
  'Image: Add the title, year, artwork source, and source link.',
  'OPENING NOTE: Paste the approved overview here.',
  '## In theaters',
  'Paste three short theater entries. Use box-office figures only when interesting.',
  "## What everyone's talking about",
  'Paste the approved conversation section, including at least one TV or streaming title.',
  'GIF SLOT: Add Savannah\'s chosen GIF, caption, and source, or remove this block.',
  '## Now on TV and Streaming',
  'Add each title\'s hosted image, source caption, and approved paragraph. New titles first, returning seasons after.',
  '## Coming up',
  'Add at least three upcoming titles. Lead with a clickable official-trailer thumbnail, followed by its paragraph. Other titles get an image and an official-trailer link.',
  '## The charts',
  'Your trending top ten.',
  'Paste the approved ten linked chart rows and their movement labels.',
  '[Want more? See the full top 20 chart on Plot](https://theplot.tv/whats-on/chart)',
  '## Weekend watch',
  'Add each pick\'s hosted image and caption directly above its paragraph and individual Plot save link.',
  'Give Friday-you a small gift: save these picks to your Plot watchlist now. Snacks are a weekend problem. Deciding what to watch doesn\'t have to be.',
  'Chart and title artwork: TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.',
].join('\n\n');
let html = renderEmail({ subject: 'Plot weekly newsletter master', date: '2026-10-19', body }, { unsubscribeUrl: '{{ unsubscribe }}' });
html = html.replace('the week of October 19', 'WEEK OF [ISSUE DATE]');
html = html.replace(/(<body[^>]*>)/, '$1<!-- Duplicate this master before preparing an approved issue. Replace instruction blocks and host images. --><div style="display:none;max-height:0;overflow:hidden;">[Replace with approved preview text]</div>');
writeFileSync(new URL('plot-weekly-master.html', import.meta.url), html);
