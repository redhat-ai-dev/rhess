import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'rhess_theme';
const DARK_CLASS = 'pf-v6-theme-dark';
const GLASS_CLASS = 'pf-v6-theme-glass';

function getInitialDark(): boolean {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark') return true;
  if (saved === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

interface ThemeContextValue {
  isDark: boolean;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  toggle: () => {},
});

export function useThemeProvider(): ThemeContextValue {
  const [isDark, setIsDark] = useState(getInitialDark);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add(DARK_CLASS);
    } else {
      document.documentElement.classList.remove(DARK_CLASS);
    }
    document.documentElement.classList.add(GLASS_CLASS);
    document.documentElement.style.setProperty(
      '--pf-t--global--background--image--default',
      `url(${isDark ? '/bg-dark.png' : '/bg-light.png'})`
    );
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggle = useCallback(() => setIsDark((d) => !d), []);

  return { isDark, toggle };
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
