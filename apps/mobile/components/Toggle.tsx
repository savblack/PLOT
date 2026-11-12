/**
 * The app's on/off switch: the system Switch with Plot's track colors, so
 * every toggle is the same pink when on and the deeper cream when off.
 */
import { Switch, type SwitchProps } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function Toggle(props: Omit<SwitchProps, 'trackColor' | 'ios_backgroundColor'>) {
  const { colors } = useTheme();
  return <Switch {...props} trackColor={{ true: colors.accent, false: colors.surfaceSunken }} ios_backgroundColor={colors.surfaceSunken} />;
}
