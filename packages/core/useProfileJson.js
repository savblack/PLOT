/* One JSON setting on the viewer's profile row (home_layout, ui_prefs):
 * read from the profile, changed optimistically, written back through
 * updateProfile. A failed write puts the previous value back and reports it.
 * Storing the default writes null, so most people never have a value at all.
 *
 * `save(userId, value)` does the write, so each caller names its column in a
 * literal `updateProfile({ patch: { column: value } })`. That is what lets
 * profileGrants.test.js see which columns are written and check each has a
 * column-level UPDATE grant on profiles.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @template T
 * @param {{
 *   userId?: string | null,
 *   save: (userId: string, value: T | null) => Promise<{ error: any }>,
 *   saved: unknown,
 *   normalize: (raw: unknown) => T,
 *   isDefault: (value: T) => boolean,
 *   defaults: () => T,
 *   onPersisted?: () => void,
 * }} args  saved: the column as loaded on the profile.
 * @returns {{
 *   value: T,
 *   isDefault: boolean,
 *   saving: boolean,
 *   error: any,
 *   update: (change: T | ((current: T) => T)) => void,
 *   reset: () => void,
 * }}
 */
export function useProfileJson({ userId, save, saved, normalize, isDefault, defaults, onPersisted }) {
  const [value, setValue] = useState(() => normalize(saved));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(0);
  const savedKey = JSON.stringify(saved ?? null);

  // Another device changed it: adopt the server's copy unless a write of ours
  // is still in flight, in which case ours is newer.
  useEffect(() => {
    if (pending.current > 0) return;
    setValue(normalize(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compare by value
  }, [savedKey]);

  const update = useCallback((change) => {
    setValue((current) => {
      const resolved = typeof change === 'function' ? change(current) : change;
      if (!userId) return resolved;
      const previous = current;
      pending.current += 1;
      setSaving(true);
      setError(null);
      const patch = isDefault(resolved) ? null : resolved;
      save(userId, patch).then(({ error: writeError }) => {
        pending.current -= 1;
        if (pending.current === 0) setSaving(false);
        if (writeError) { setError(writeError); setValue(previous); return; }
        onPersisted?.();
      });
      return resolved;
    });
  }, [userId, save, isDefault, onPersisted]);

  const reset = useCallback(() => update(defaults()), [update, defaults]);

  return { value, isDefault: isDefault(value), saving, error, update, reset };
}
