import { assertEquals } from 'jsr:@std/assert@1';
import { allowedTmdbRedirect } from './tmdbAccount.ts';

Deno.test('allowedTmdbRedirect accepts the app callbacks', () => {
  for (const url of [
    'https://app.theplot.tv/auth/tmdb',
    'https://theplot.tv/auth/tmdb',
    'https://abc123.plot-5wr.pages.dev/auth/tmdb',
    'http://localhost:5177/auth/tmdb',
    'http://127.0.0.1:5177/auth/tmdb',
    'plot://auth/tmdb',
  ]) assertEquals(allowedTmdbRedirect(url), true, url);
});

Deno.test('allowedTmdbRedirect refuses other hosts, paths and schemes', () => {
  for (const url of [
    '',
    'not a url',
    'https://evil.example/auth/tmdb',
    'https://theplot.tv.evil.example/auth/tmdb',
    'https://eviltheplot.tv/auth/tmdb',
    'http://app.theplot.tv/auth/tmdb',
    'https://app.theplot.tv/auth/simkl',
    'https://app.theplot.tv/auth/tmdb/../x',
    'https://user:pass@app.theplot.tv/auth/tmdb',
    'http://localhost.evil.example/auth/tmdb',
    'plot://auth/tmdb/extra',
    'javascript:alert(1)',
  ]) assertEquals(allowedTmdbRedirect(url), false, url);
});

Deno.test('tmdbTokenBinding is per account and per token', async () => {
  const { tmdbTokenBinding } = await import('./tmdbAccount.ts');
  const token = 'a'.repeat(40);
  const mine = await tmdbTokenBinding('secret', 'user-a', token);
  assertEquals(mine, await tmdbTokenBinding('secret', 'user-a', token));
  assertEquals(/^[0-9a-f]{64}$/.test(mine), true);
  assertEquals(mine === await tmdbTokenBinding('secret', 'user-b', token), false);
  assertEquals(mine === await tmdbTokenBinding('secret', 'user-a', 'b'.repeat(40)), false);
  assertEquals(mine === await tmdbTokenBinding('other', 'user-a', token), false);
});

Deno.test('tmdbTokenRefused only for TMDB token refusals', async () => {
  const { tmdbTokenRefused } = await import('./tmdbAccount.ts');
  for (const code of [6, 17, 33]) assertEquals(tmdbTokenRefused(code), true, String(code));
  for (const code of [null, 7, 25, 34]) assertEquals(tmdbTokenRefused(code), false, String(code));
});
