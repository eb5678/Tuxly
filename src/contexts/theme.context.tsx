import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Hardcode Dark Theme App-wide
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "system");
    root.classList.add("dark");
  }, []);

  return <>{children}</>;
}