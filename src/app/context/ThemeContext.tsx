import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
type MoonTheme = 'light' | 'dark';
const ThemeContext = createContext<{
  theme: MoonTheme;
  setTheme: (t: MoonTheme) => void;
  toggleTheme: () => void;
} | null>(null);
function initial(): MoonTheme {
  try {
    const saved = localStorage.getItem('mooncci-theme');
    return saved === 'dark' || saved === 'plasma' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<MoonTheme>(initial);
  useEffect(() => {
    document.documentElement.dataset.moonTheme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('mooncci-theme', theme);
    } catch {}
  }, [theme]);
  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    }),
    [theme],
  );
  return (
    <ThemeContext.Provider value={value}>
      <div className="moon-app-layer">{children}</div>
    </ThemeContext.Provider>
  );
}
export function useMoonTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw Error('Missing theme provider');
  return value;
}
export function ThemeToggle() {
  const { theme, toggleTheme } = useMoonTheme();
  return (
    <button
      className="icon-button"
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'light' ? '切换深色主题' : '切换浅色主题'}
      title={theme === 'light' ? '切换深色主题' : '切换浅色主题'}
    >
      {theme === 'light' ? <Moon /> : <Sun />}
    </button>
  );
}
