const HAPTIC_DURATION = 5;

export const triggerHaptic = (duration = HAPTIC_DURATION) => {
  if (navigator?.vibrate) {
    navigator.vibrate(duration);
  }
};
