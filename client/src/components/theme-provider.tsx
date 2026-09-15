import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  // Registers a request to force light mode regardless of `theme`; returns
  // the function to release it. Counted so multiple callers can overlap.
  registerForceLight: () => () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "dark"
  );
  const [forceLightCount, setForceLightCount] = useState(0);

  // Single place that ever touches the DOM class, so a forced-light request
  // from a descendant can never be raced/clobbered by this running first —
  // it reacts to forceLightCount the same way it reacts to theme.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(forceLightCount > 0 ? "light" : theme);
    localStorage.setItem("theme", theme);
  }, [theme, forceLightCount]);

  const setTheme = useCallback((newTheme: Theme) => setThemeState(newTheme), []);

  // Stable identity — consumers key their effect's cleanup on this, so a new
  // function every render would register/unregister in an endless loop.
  const registerForceLight = useCallback(() => {
    setForceLightCount((c) => c + 1);
    return () => setForceLightCount((c) => c - 1);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, registerForceLight }),
    [theme, setTheme, registerForceLight]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}