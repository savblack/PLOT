// Reuses Plot's social feature template for this issue's lead artwork.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { WORDMARK_PATH } from '../../../../packages/core/wordmark.js';
const root = new URL('../../../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const font = readFileSync(new URL('../apps/web/public/fonts/Gabarito-Bold.ttf', root)).toString('base64');
const data = { kicker: 'WEEK OF OCT 19', title: { title: 'Street Fighter', backdrop_data_uri: 'https://image.tmdb.org/t/p/w1280/zDE9hd1SG9695YncbZGjSf7Z9Jk.jpg' }, subtitle: 'Audiences are having fun. Critics want a better story.' };
const html = read('templates/feature.html').replace('</head>', '<style>.subline {font-family:Gabarito, sans-serif;font-size:60px;font-weight:700;line-height:1.08;max-width:1150px;color:#f0efe8;}</style></head>').replace('/*INLINE_BASE_CSS*/', `@font-face {font-family:Gabarito;src:url(data:font/ttf;base64,${font});font-weight:700}\n` + read('templates/base.css')).replace('/*HELPERS_JS*/',read('templates/_helpers.js').replace("'/*WORDMARK_PATH*/'",JSON.stringify(WORDMARK_PATH))).replace('"/*DATA_JSON*/"',JSON.stringify(data));
writeFileSync(new URL('featured.html',import.meta.url),html);
const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page = await browser.newPage({viewport:{width:1600,height:900}});
await page.setContent(html,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:new URL('featured.jpg',import.meta.url).pathname,type:'jpeg',quality:90});await browser.close();
