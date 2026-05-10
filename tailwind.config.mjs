/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Material 3 Semantic Palette - Artisanal Atelier
        primary: "#815431",
        "on-primary": "#ffffff",
        "primary-container": "#c08a63",
        "on-primary-container": "#492506",
        "primary-fixed": "#ffdcc5",
        "primary-fixed-dim": "#f6ba90",
        "on-primary-fixed": "#301400",
        "on-primary-fixed-variant": "#663d1c",

        secondary: "#4b6450",
        "on-secondary": "#ffffff",
        "secondary-container": "#cdead0",
        "on-secondary-container": "#516a56",
        "secondary-fixed": "#cdead0",
        "secondary-fixed-dim": "#b1ceb5",
        "on-secondary-fixed": "#082010",
        "on-secondary-fixed-variant": "#344c39",

        tertiary: "#2f6671",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#699eaa",
        "on-tertiary-container": "#00343c",
        "tertiary-fixed": "#b5ebf8",
        "tertiary-fixed-dim": "#99cfdc",
        "on-tertiary-fixed": "#001f25",
        "on-tertiary-fixed-variant": "#114e58",

        error: "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",

        background: "#faf9f6",
        "on-background": "#1a1c1a",
        outline: "#83746b",
        "outline-variant": "#d5c3b8",

        surface: "#faf9f6",
        "on-surface": "#1a1c1a",
        "surface-variant": "#e3e2e0",
        "on-surface-variant": "#51443c",
        "surface-dim": "#dbdad7",
        "surface-bright": "#faf9f6",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f4f3f1",
        "surface-container": "#efeeeb",
        "surface-container-high": "#e9e8e5",
        "surface-container-highest": "#e3e2e0",
        
        // Legacy support
        brand: "#815431",
        well: "#f4f3f1",
        lift: "#ffffff",
        text: "#1a1c1a",
        muted: "#51443c",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Manrope", "sans-serif"],
      },
      borderRadius: {
        sm: "12px",
        md: "16px",
        lg: "24px",
        xl: "32px",
      },
      boxShadow: {
        sm: "0 2px 8px rgba(26,28,26,0.04)",
        md: "0 8px 32px rgba(26,28,26,0.06)",
        lg: "0 12px 48px rgba(26,28,26,0.08)",
      }
    },
  },
  plugins: [],
}
