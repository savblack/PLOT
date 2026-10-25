import { assertEquals } from 'jsr:@std/assert@1';
import {
  authCallbackRedirect,
  authLinkMail,
  bypassAction,
  isExistingAccountError,
  isMissingUserError,
} from './signupBypass.ts';

Deno.test('signup and resend links tell the callback this is a bypass signup', () => {
  const signup = new URL(authCallbackRedirect('https://app.theplot.tv', 'signup'));
  assertEquals(signup.origin + signup.pathname, 'https://app.theplot.tv/auth/callback');
  assertEquals(signup.searchParams.get('from'), 'signup');
  assertEquals(signup.searchParams.get('method'), 'email');
  assertEquals(signup.searchParams.get('via'), 'bypass');

  const resend = new URL(authCallbackRedirect(null, 'resend'));
  assertEquals(resend.searchParams.get('from'), 'signup');
  assertEquals(resend.searchParams.get('via'), 'bypass');
});

Deno.test('a magic link stays a sign-in unless this click finishes signup', () => {
  const signIn = new URL(authCallbackRedirect('http://localhost:5177', 'magiclink'));
  assertEquals(signIn.origin, 'http://localhost:5177');
  assertEquals(signIn.searchParams.get('from'), null);
  assertEquals(signIn.searchParams.get('method'), 'magic_link');
  assertEquals(signIn.searchParams.get('via'), 'bypass');

  const finishing = new URL(authCallbackRedirect('https://app.theplot.tv', 'magiclink', true));
  assertEquals(finishing.searchParams.get('from'), 'signup');
  assertEquals(finishing.searchParams.get('method'), 'email');
});

Deno.test('an unknown origin cannot choose the redirect host', () => {
  const url = new URL(authCallbackRedirect('https://evil.example', 'signup'));
  assertEquals(url.origin, 'https://app.theplot.tv');
});

Deno.test('existing-account and missing-user errors are distinguished', () => {
  assertEquals(isExistingAccountError('A user with this email address has already been registered'), true);
  assertEquals(isExistingAccountError('User already registered'), true);
  assertEquals(isExistingAccountError('database unavailable'), false);
  assertEquals(isMissingUserError('User with this email not found'), true);
  assertEquals(isMissingUserError('already been registered'), false);
});

Deno.test('unknown actions stay on the signup path', () => {
  assertEquals(bypassAction('resend'), 'resend');
  assertEquals(bypassAction('magiclink'), 'magiclink');
  assertEquals(bypassAction('drop-table'), 'signup');
  assertEquals(bypassAction(undefined), 'signup');
});

Deno.test('signup mail confirms the account and a magic link signs in', () => {
  const confirm = authLinkMail('signup', 'https://example.test/confirm');
  assertEquals(confirm.subject, 'Confirm your Plot account');
  assertEquals(confirm.text.includes('https://example.test/confirm'), true);
  const magic = authLinkMail('magiclink', 'https://example.test/magic');
  assertEquals(magic.subject, 'Your Plot sign-in link');
  assertEquals(magic.text.includes('https://example.test/magic'), true);
});
