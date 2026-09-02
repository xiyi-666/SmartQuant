import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

export type ThemeMode = "light" | "dark";

const PREFS_STORAGE_KEY = "quartsys_prefs";
export const THEME_CHANGE_EVENT = "quartsys:theme-changed";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

declare global {
  interface Window {
    __QUARTSYS_INITIAL_THEME__?: ThemeMode;
  }
}

function readTheme(): ThemeMode {
  if (window.__QUARTSYS_INITIAL_THEME__ === "light") return "light";
  if (window.__QUARTSYS_INITIAL_THEME__ === "dark") return "dark";
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) || "{}");
    return prefs?.theme === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function persistTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) || "{}");
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({ ...prefs, theme }));
  } catch {
    // The current document can still apply the selected theme.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readTheme);

  useLayoutEffect(() => {
    persistTheme(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (nextTheme) => {
        persistTheme(nextTheme);
        setThemeState(nextTheme);
        window.dispatchEvent(
          new CustomEvent(THEME_CHANGE_EVENT, { detail: nextTheme }),
        );
      },
      toggleTheme: () => {
        const nextTheme = theme === "dark" ? "light" : "dark";
        persistTheme(nextTheme);
        setThemeState(nextTheme);
        window.dispatchEvent(
          new CustomEvent(THEME_CHANGE_EVENT, { detail: nextTheme }),
        );
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
