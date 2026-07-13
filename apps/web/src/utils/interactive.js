export function handleActivationKeyDown(event, onActivate) {
  if (!onActivate || event.defaultPrevented || event.target !== event.currentTarget) {
    return;
  }

  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  onActivate(event);
}

export function getButtonLikeProps({ onPress, disabled = false, label, pressed } = {}) {
  const props = {};

  if (label) props['aria-label'] = label;
  if (pressed !== undefined) props['aria-pressed'] = pressed;

  if (disabled) {
    props['aria-disabled'] = true;
    return props;
  }

  props.role = 'button';
  props.tabIndex = 0;
  props.onKeyDown = (event) => handleActivationKeyDown(event, onPress);

  return props;
}
