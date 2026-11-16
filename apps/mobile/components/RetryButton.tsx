/**
 * "Retry" under a "couldn't load" message: on full-screen error states and
 * inside the title and collection panels. The shared small secondary button.
 */
import Button from './Button';

export default function RetryButton({ onPress, accessibilityLabel }: { onPress: () => void; accessibilityLabel?: string }) {
  return <Button size="sm" label="Retry" onPress={onPress} accessibilityLabel={accessibilityLabel} />;
}
