import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  Dimensions, Image, Animated, Easing, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '../../lib/supabase';
import { tmdb } from '../../lib/tmdb';
// This screen is a fixed composition (dark poster wall + light glass panel,
// mirroring the web AuthPage) — it deliberately doesn't follow the app theme.
import { fontFamily, fontSize, radii, spacing } from '../../lib/tokens';
import Turnstile from '../../components/Turnstile';
import { track, EVENTS } from '../../lib/analytics';
import { authErrorReason } from '@plot/core/authErrors.js';

const { width: W, height: H } = Dimensions.get('window');

const POSTER_W = 110;
const POSTER_H = 165;
const GAP = 10;

// Fallback posters shown while trending loads
const FALLBACK_PATHS = [
  '/qNBAXBIQlnOThrVvA6mA2B5ggV6.jpg', // Interstellar
  '/1E5baAaEse26fej7uHcjOgEE2t2.jpg', // Breaking Bad
  '/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg', // Dune
  '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', // Stranger Things
  '/xkGAAsn4c6NMqPLNTfV1jEF1tXG.jpg', // The Bear
  '/9PqD3wSIjntyJDBzMNuxuKHcMKO.jpg', // Oppenheimer
  '/9faGSFi5jam6pDWGNd0p8JcJgXQ.jpg', // Game of Thrones
  '/pIkRyD18kl4FhoCId0O9CiIDBnA.jpg', // Barbie
  '/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg', // Succession
  '/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg', // The Last of Us
  '/rktDFPbfHfUbArZ6OOOKsXcv0Bm.jpg', // Poor Things
  '/d5NXSklpcvkCgnJQ3GCX9wBg5HU.jpg', // Killers of the Flower Moon
  '/zIYROrkHJPYB3VTiW1L9QVgaAi.jpg',  // The Crown
  '/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg', // Anatomy of a Fall
  '/odJ4hx6g6vBt4lBWKFD1tI8WS4x.jpg', // Beef
  '/jkJ2OmqRkGRPbzMZ3IaLQFEjqe0.jpg', // Maestro
  '/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', // Severance
  '/gKkl37BQuKTanygYQG1pyYgLVgf.jpg', // The White Lotus
  '/fgwFhOBMVfM0TRf7kXGIbOFbpEd.jpg', // Andor
  '/AaAWKJhOlYnMFfmCb1YoGGUVGTF.jpg', // White Noise
  '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg', // Shogun
  '/lqoMzCcZYEFK729d6qzt349fB4o.jpg', // True Detective S1
  '/A0w2JFwXzJrKqDaBFXIQKifO9t1.jpg', // The Penguin
  '/sRLC052ioneo2LuksGm8R5EBEwP.jpg', // Alien: Romulus
  '/NpS5hCfKMtF8OepxAArFHyFRnJj.jpg', // Civil War
  '/iXtL2v1tKbOgA1TCPuDIMtJHgHg.jpg', // Hit Man
  '/9Gtg2DzBhmYamXBS1hKAhiwbBKS.jpg', // Inside Out 2
  '/kdPMUlnzIxkdnVBcalKKWwFZVgu.jpg', // Longlegs
  '/mBaXZ95R2OxueZhvQbcEWy2DqyO.jpg', // Challengers
  '/ta5oblpMlEcIPIS2YGcq9XEkWK2.jpg', // Baby Reindeer
  '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', // Parasite
  '/oHlmBFMHcEzBz7pf8uAzLuOT6PH.jpg', // Everything Everywhere
  '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', // The Substance
  '/hm58nYGGGkjGKR1bV5b0iJP3p4x.jpg', // Conclave
  '/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg', // Nosferatu
  '/kHf9MCg3dFlCfQjZZxRzAiQWgXm.jpg', // Saturday Night
];

function buildColumns(paths: string[], cols: number) {
  const columns: string[][] = Array.from({ length: cols }, () => []);
  paths.forEach((p, i) => columns[i % cols].push(p));
  return columns;
}

function ScrollingColumn({ paths, offset, duration }: { paths: string[]; offset: number; duration: number }) {
  const translateY = useRef(new Animated.Value(offset)).current;
  const totalH = paths.length * (POSTER_H + GAP);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translateY, {
        toValue: offset - totalH,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const doubled = [...paths, ...paths];

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      {doubled.map((p, i) => (
        <View key={i} style={{ marginBottom: GAP }}>
          <Image
            source={{ uri: `https://image.tmdb.org/t/p/w342${p}` }}
            style={{ width: POSTER_W, height: POSTER_H, borderRadius: 10 }}
            resizeMode="cover"
          />
        </View>
      ))}
    </Animated.View>
  );
}

type Mode = 'signin' | 'signup' | 'forgot';

// Cloudflare Turnstile — the Supabase project enforces captcha on auth, so
// every sign-in / sign-up / magic-link must carry a token (mirrors web AuthPage).
const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

// Password-reset + confirmation links resolve on the web app (there's no
// native set-new-password screen yet), so point them at the web callback.
const AUTH_WEB_CALLBACK = 'https://app.theplot.tv/auth/callback';

// Magic links sign the user straight into a session — unlike reset/confirm,
// there's nothing that needs a browser, so send them back into the app via
// the plot:// deep link that app/(auth)/callback.tsx already listens for.
// PRODUCTION REQUIREMENT: this resolves to plot://auth/callback — add that
// exact URL to Supabase Dashboard → Authentication → URL Configuration →
// Redirect URLs, or signInWithOtp will reject it and fall back to erroring.
const AUTH_APP_CALLBACK = Linking.createURL('/auth/callback');

// Kind, PLOT-voiced auth errors (mirrors web AuthPage's friendlyError).
function friendlyAuthError(msg?: string) {
  if (!msg) return 'Something went wrong. Please try again.';
  if (msg.includes('Invalid login credentials'))   return 'Oops! Incorrect email or password.';
  if (msg.includes('Email not confirmed'))         return 'Almost in! Your activation email is waiting in your inbox.';
  if (msg.includes('User already registered'))     return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('Password should be at least')) return 'Password must be at least 6 characters.';
  if (msg.includes('Unable to validate email'))    return 'Please enter a valid email address.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Please wait a moment and try again.';
  return msg;
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [posterPaths, setPosterPaths] = useState<string[]>(FALLBACK_PATHS);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0); // bump to force a fresh token (single-use)

  // If no site key is configured the widget is a no-op, so don't block submit on it.
  const captchaReady = !TURNSTILE_SITE_KEY || !!captchaToken;
  const refreshCaptcha = () => setCaptchaNonce((n) => n + 1);

  // Funnel head, mirroring web: one view event per time the signup form is
  // shown, then one "started" on the first keystroke. The typed value is never
  // captured — only the fact that typing began.
  const signupStarted = useRef(false);
  useEffect(() => {
    if (mode === 'signup') {
      track(EVENTS.SIGNUP_FORM_VIEWED);
      signupStarted.current = false;
    }
  }, [mode]);

  const noteSignupStarted = () => {
    if (mode !== 'signup' || signupStarted.current) return;
    signupStarted.current = true;
    track(EVENTS.SIGNUP_FORM_STARTED);
  };

  useEffect(() => {
    tmdb.getTrending('all', 'week').then((data) => {
      const paths = data?.results
        ?.filter((item: any) => item.poster_path)
        .map((item: any) => item.poster_path as string) ?? [];
      if (paths.length >= 9) setPosterPaths(paths);
    });
  }, []);

  const columns = buildColumns(posterPaths, 3);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const handleSignIn = async () => {
    if (!email || !password) return;
    if (!isValidEmail(email)) { Alert.alert('Please enter a valid email address.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password, options: { captchaToken: captchaToken ?? undefined },
    });
    setLoading(false);
    refreshCaptcha();
    if (!error) track(EVENTS.USER_LOGGED_IN, { method: 'password' });
    if (error) {
      track(EVENTS.LOGIN_SUBMIT_FAILED, { reason: authErrorReason(error.message) });
      // Offer to resend the confirmation email when the account isn't verified.
      if (error.message.includes('Email not confirmed')) {
        Alert.alert(friendlyAuthError(error.message), undefined, [
          { text: 'Resend email', onPress: handleResend },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert(friendlyAuthError(error.message));
      }
    }
  };

  const handleResend = async () => {
    const e = email.trim();
    if (!e || !isValidEmail(e)) { Alert.alert('Please enter a valid email address.'); return; }
    const { error } = await supabase.auth.resend({
      type: 'signup', email: e,
      options: { emailRedirectTo: AUTH_WEB_CALLBACK, captchaToken: captchaToken ?? undefined },
    });
    refreshCaptcha();
    Alert.alert(error ? friendlyAuthError(error.message) : 'Confirmation email resent.');
  };

  const handleForgot = async () => {
    if (!email) return;
    if (!isValidEmail(email)) { Alert.alert('Please enter a valid email address.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: AUTH_WEB_CALLBACK,
      captchaToken: captchaToken ?? undefined,
    });
    setLoading(false);
    refreshCaptcha();
    if (error) Alert.alert(friendlyAuthError(error.message));
    else {
      track(EVENTS.PASSWORD_RESET_REQUESTED);
      Alert.alert('Check your email', 'We sent a link to reset your password.');
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) return;
    if (!isValidEmail(email)) { Alert.alert('Please enter a valid email address.'); return; }
    if (password.length < 6) { Alert.alert('Password must be at least 6 characters.'); return; }
    setLoading(true);
    track(EVENTS.SIGNUP_SUBMIT_CLICKED);
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password, options: { captchaToken: captchaToken ?? undefined },
    });
    setLoading(false);
    refreshCaptcha();
    if (error) {
      track(EVENTS.SIGNUP_SUBMIT_FAILED, { reason: authErrorReason(error.message) });
      Alert.alert(friendlyAuthError(error.message));
    }
    else Alert.alert('Almost there!', `We sent a confirmation link to ${email.trim()}.`, [
      { text: 'Resend', onPress: handleResend },
      { text: 'OK', style: 'cancel' },
    ]);
  };

  const handleMagicLink = async () => {
    if (!email) return;
    if (!isValidEmail(email)) { Alert.alert('Please enter a valid email address.'); return; }
    if (!captchaReady) { Alert.alert('One moment', 'Just finishing a quick security check…'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: AUTH_APP_CALLBACK, captchaToken: captchaToken ?? undefined },
    });
    setLoading(false);
    refreshCaptcha();
    if (error) {
      track(EVENTS.LOGIN_SUBMIT_FAILED, { method: 'magic_link', reason: authErrorReason(error.message) });
      Alert.alert(friendlyAuthError(error.message));
    } else {
      Alert.alert('Magic link sent.', 'Check your inbox to sign in.');
    }
  };

  const handleSubmit = () => {
    if (mode === 'forgot') handleForgot();
    else if (mode === 'signin') handleSignIn();
    else handleSignUp();
  };

  const submitLabel = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link';

  return (
    <View style={styles.root}>
      {/* ── Scrolling poster mosaic ── */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.mosaic}>
          {columns.map((col, ci) => (
            <View key={ci} style={{ width: POSTER_W, marginHorizontal: GAP / 2, overflow: 'hidden', flex: 1 }}>
              <ScrollingColumn
                paths={col}
                offset={ci === 1 ? -(POSTER_H + GAP) * 2 : 0}
                duration={[38000, 32000, 42000][ci]}
              />
            </View>
          ))}
        </View>

        {/* Dark vignette overlay */}
        <LinearGradient
          colors={['rgba(9,9,11,0.3)', 'rgba(9,9,11,0.55)', 'rgba(9,9,11,0.85)', '#09090B']}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── Content ── */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Wordmark at top */}
        <View style={[styles.wordmarkWrap, { paddingTop: insets.top + spacing.xl }]}>
          <Text style={styles.wordmark}>PLOT</Text>
          <Text style={styles.tagline}>Your personal film & TV companion</Text>
        </View>

        {/* Glass panel */}
        <View style={[styles.panelWrap, { paddingBottom: insets.bottom + spacing.xl }]}>
          <BlurView intensity={60} tint="light" style={styles.panel}>
            <LinearGradient
              colors={['rgba(255,255,255,0.50)', 'rgba(255,255,255,0.88)']}
              locations={[0, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.panelInner}
            >
              {/* Heading */}
              <Text style={styles.panelTitle}>
                {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
              </Text>
              <Text style={styles.panelSub}>
                {mode === 'signin' ? 'Good to see you again.'
                  : mode === 'signup' ? 'For people who think about what they watch.'
                  : "We'll send a link to your inbox."}
              </Text>

              {/* Fields */}
              <View style={styles.fields}>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor="#898989"
                    value={email}
                    onChangeText={(t) => { setEmail(t); noteSignupStarted(); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    returnKeyType="next"
                    onSubmitEditing={undefined}
                  />
                </View>

                {mode !== 'forgot' && (
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>Password</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="••••••••"
                      placeholderTextColor="#898989"
                      value={password}
                      onChangeText={(t) => { setPassword(t); noteSignupStarted(); }}
                      secureTextEntry
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      returnKeyType="go"
                      onSubmitEditing={handleSubmit}
                    />
                    {mode === 'signin' && (
                      <TouchableOpacity onPress={() => setMode('forgot')} style={styles.forgotUnder}>
                        <Text style={styles.forgotText}>Forgot password?</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* CTA — solid ink, like the web .auth-cta. Turnstile takes no space
                  and ignores touches by default (see its own pointerEvents) — if
                  Cloudflare ever decides this sign-in needs a real interactive
                  check, it pops up over the fields above instead of permanently
                  reserving a gap for something that's normally invisible. */}
              <View style={styles.ctaWrap}>
                {TURNSTILE_SITE_KEY ? (
                  <View style={styles.captcha}>
                    <Turnstile
                      siteKey={TURNSTILE_SITE_KEY}
                      onToken={setCaptchaToken}
                      resetSignal={captchaNonce}
                    />
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.cta, (loading || !captchaReady) && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={loading || !captchaReady}
                  activeOpacity={0.85}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.ctaText}>{submitLabel}</Text>}
                </TouchableOpacity>
              </View>

              {/* Mode switcher — show only the opposite mode, like web .auth-toggle */}
              {mode === 'forgot' ? (
                <View style={styles.modeRow}>
                  <TouchableOpacity onPress={() => setMode('signin')}>
                    <Text style={styles.modeLink}>Back to sign in</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.modeRow}>
                    <Text style={styles.modePrompt}>
                      {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                    </Text>
                    <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                      <Text style={styles.modeLink}>{mode === 'signin' ? 'Sign up' : 'Sign in'}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Magic link */}
                  <TouchableOpacity onPress={handleMagicLink} style={styles.magicLinkBtn}>
                    <Text style={styles.magicLinkText}>Send a magic link instead</Text>
                  </TouchableOpacity>
                </>
              )}
            </LinearGradient>
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  mosaic: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: GAP / 2,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  kav: {
    flex: 1,
    justifyContent: 'space-between',
  },
  wordmarkWrap: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  wordmark: {
    fontFamily: fontFamily.serif,
    fontSize: 52,
    color: '#FAFAFA',
    letterSpacing: -1,
  },
  tagline: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: 'rgba(250,250,250,0.5)',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  panelWrap: {
    paddingHorizontal: spacing.lg,
  },
  panel: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  panelInner: {
    padding: spacing.xl,
    borderRadius: 28,
    overflow: 'hidden',
  },
  panelTitle: {
    // Editorial serif headline, matching web .auth-header h1 (var(--font-serif)).
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xxl,
    color: '#09090B',
    marginBottom: 4,
    textAlign: 'center',
  },
  panelSub: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: '#71717A',
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  fields: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  inputWrap: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.xs,
    color: '#71717A',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  forgotUnder: { alignSelf: 'flex-end', marginTop: 2 },
  forgotText: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: '#71717A',
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    color: '#09090B',
  },
  ctaWrap: {
    marginBottom: spacing.lg,
  },
  captcha: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: spacing.xs,
    alignItems: 'center',
  },
  cta: {
    backgroundColor: '#09090B',
    borderRadius: radii.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.md,
    color: '#fff',
    letterSpacing: 0.2,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modePrompt: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: '#71717A',
  },
  modeLink: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    color: '#09090B',
  },
  magicLinkBtn: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  magicLinkText: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: '#A1A1AA',
  },
});
