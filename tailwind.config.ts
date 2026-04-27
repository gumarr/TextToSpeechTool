// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  // Only scan files that actually use Tailwind classes — avoids bloated CSS
  content: [
    "./src/**/*.{ts,tsx,html}",
    "./electron/**/*.ts",   // in case you add Tailwind classes in preload UI
  ],
  darkMode: "class",  // switch via className="dark" on <html> — controlled by nativeTheme
  theme: {
    extend: {
      // Mirror the CSS custom properties so you can use Tailwind classes like text-accent
      colors: {
        "bg-base": "var(--color-bg-base)",
        "bg-surface": "var(--color-bg-surface)",
        "bg-elevated": "var(--color-bg-elevated)",
        "bg-hover": "var(--color-bg-hover)",
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-muted": "var(--color-text-muted)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        error: "var(--color-error)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
      },
    },
  },
  plugins: [],
};

export default config;
