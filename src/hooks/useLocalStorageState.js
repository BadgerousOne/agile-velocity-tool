import { useEffect, useRef, useState } from 'react';

export function useLocalStorageState(key, initialValue, options = {}) {
  const {
    parse = value => value,
    serialize = value => String(value),
  } = options;

  const keyRef = useRef(key);

  const getStoredValue = (storageKey) => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved != null) {
        return parse(saved);
      }
    } catch { /* ignore parse errors, fall through to initial value */ }
    return typeof initialValue === 'function' ? initialValue() : initialValue;
  };

  const [value, setValue] = useState(() => getStoredValue(key));

  // When key changes, read the new key's value and update state.
  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      setValue(getStoredValue(key));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(keyRef.current, serialize(value));
    } catch { /* ignore quota errors */ }
  }, [value, serialize]);

  return [value, setValue];
}
