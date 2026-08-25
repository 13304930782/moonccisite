import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Layers3, Sparkles } from 'lucide-react';
import Plasma from '../components/Plasma';

type MoonTheme = 'paper' | 'plasma';

type ThemeContextValue = {
  theme: MoonTheme;
  setTheme: (theme: MoonTheme) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = 'mooncci-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): MoonTheme {
  if (typeof window === 'undefined') return 'paper';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'plasma' ? 'plasma' : 'paper';
  } catch {
    return 'paper';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<MoonTheme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.moonTheme = theme;
    document.documentElement.style.colorScheme = theme === 'plasma' ? 'dark' : 'light';
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Theme switching still works when storage is unavailable.
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme((current) => current === 'paper' ? 'plasma' : 'paper'),
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      <div className="moon-theme-backdrop" aria-hidden="true">
        {theme === 'plasma' && (
          <Plasma
            color="#ff6b35"
            speed={0.6}
            direction="forward"
            scale={1.1}
            opacity={0.8}
            mouseInteractive
          />
        )}
      </div>
      <div className="moon-app-layer">{children}</div>
      <button
        type="button"
        className="moon-theme-toggle"
        data-target-theme={theme === 'paper' ? 'plasma' : 'paper'}
        onClick={value.toggleTheme}
        aria-label={theme === 'paper' ? '切换到 Plasma 主题' : '切换到纸张主题'}
        title={theme === 'paper' ? '切换到 Plasma 主题' : '切换到纸张主题'}
      >
        <span className="moon-theme-toggle-orb" aria-hidden="true">
          {theme === 'paper' ? <Sparkles /> : <Layers3 />}
        </span>
        <span className="moon-theme-toggle-copy">
          <small>THEME</small>
          <strong>{theme === 'paper' ? 'PLASMA' : 'PAPER'}</strong>
        </span>
      </button>
    </ThemeContext.Provider>
  );
}

export function useMoonTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useMoonTheme must be used inside ThemeProvider');
  return value;
}
