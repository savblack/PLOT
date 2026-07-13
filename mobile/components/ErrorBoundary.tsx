import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fontFamily, fontSize, spacing, radii } from '../lib/tokens';

interface Props { children: React.ReactNode }
interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;
    // Kind, PLOT-voiced crash screen — never surface the raw exception to users
    // (it's logged in componentDidCatch). Mirrors the web CrashScreen copy.
    return (
      <View style={styles.container}>
        <Text style={styles.title}>That scene didn't quite load.</Text>
        <Text style={styles.body}>
          An unexpected error interrupted things. A quick reload usually gets you back on track.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.8}>
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl * 2,
  },
  title: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xxl,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  btnText: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.md,
    color: '#fff',
  },
});
