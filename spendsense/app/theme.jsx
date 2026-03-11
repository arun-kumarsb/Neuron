// app/theme.js
import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "@spendsense_theme";

// Default palettes
const DARK = {
  BG: "#050816",
  CARD: "#020617",
  CARD_ELEVATED: "#0F172A",
  TEXT: "#E5E7EB",
  MUTED: "#9CA3AF",
  PRIMARY: "#4F46E5",
  BORDER: "#111827",
};

const LIGHT = {
  BG: "#F8FAFF",
  CARD: "#FFFFFF",
  CARD_ELEVATED: "#F3F4F6",
  TEXT: "#0F172A",
  MUTED: "#6B7280",
  PRIMARY: "#4F46E5",
  BORDER: "#E5E7EB",
};

const ThemeContext = createContext({
  isDark: true,
  palette: DARK,
  toggleTheme: (next) => {},
});

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_KEY);
        if (saved !== null) {
          setIsDark(saved === "true");
        } else {
          setIsDark(true); // default dark
        }
      } catch (e) {
        console.warn("[ThemeProvider] failed to load theme", e);
        setIsDark(true);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const toggleTheme = async (next) => {
    // `next` may be boolean or undefined (if called from a Switch with the new value)
    try {
      const newVal = typeof next === "boolean" ? next : !isDark;
      setIsDark(newVal);
      await AsyncStorage.setItem(THEME_KEY, newVal ? "true" : "false");
    } catch (e) {
      console.error("[ThemeProvider] toggleTheme failed", e);
    }
  };

  const palette = isDark ? DARK : LIGHT;

  // Wait until we load saved theme to render children to avoid a flash.
  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ isDark, palette, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
