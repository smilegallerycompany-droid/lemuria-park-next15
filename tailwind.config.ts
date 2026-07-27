import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        border: "hsl(var(--border))",
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        surface: { DEFAULT: "hsl(var(--surface))", foreground: "hsl(var(--surface-foreground))" },
        "surface-muted": {
          DEFAULT: "hsl(var(--surface-muted))",
          foreground: "hsl(var(--surface-muted-foreground))",
        },
        leaf: { DEFAULT: "hsl(var(--leaf))", foreground: "hsl(var(--leaf-foreground))" },
        forest: "hsl(var(--forest))",
        cream: "hsl(var(--cream))",
        milk: "hsl(var(--milk))",
        beige: "hsl(var(--beige))",
        orange: { DEFAULT: "hsl(var(--orange))", soft: "hsl(var(--orange-soft))" },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        "4xl": "2.25rem",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(70, 90, 50, 0.08)",
        card: "0 10px 32px rgba(70, 90, 50, 0.07)",
        warm: "0 16px 40px rgba(230, 120, 40, 0.18)",
        glass: "0 1px 0 rgba(255,255,255,0.7) inset, 0 18px 50px rgba(60, 80, 40, 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "var(--font-display)",
          "var(--font-manrope)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
