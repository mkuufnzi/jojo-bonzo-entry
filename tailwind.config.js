/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js,ts,jsx,tsx,ejs}",
    "./src/views/**/*.ejs",
    "./src/public/js/**/*.js"
  ],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      colors: {
        // Floovioo Modern Palette (Premium "Expensive" Tech Blue)
        'deep-ocean': '#0B1121', // Darker, richer navy (Slate 950)
        'brand-blue': '#2563EB', // Blue 600 (Deeper, more "Enterprise" than Blue 500)
        'brand-indigo': '#4338CA', // Indigo 700 (Deeper purple-blue)
        'electric-teal': '#06B6D4', // Cyan 500 (Vibrant accent)
        'off-white': '#F8FAFC', // Slate 50 (Clean background)
        
        // Semantic Mappings
        primary: '#2563EB', // Blue 600
        'primary-hover': '#1D4ED8', // Blue 700
        accent: '#06B6D4', // Cyan 500
        'accent-hover': '#0891B2', // Cyan 600
        
        // Text Colors
        'text-primary': '#0F172A', // Slate 900
        'text-secondary': '#334155', // Slate 700 (High legibility)
        'text-muted': '#64748B', // Slate 500
        border: '#E2E8F0', // Slate 200
        
        // Surface Colors (for bg-surface, etc.)
        surface: '#FFFFFF', // White
        secondary: '#64748B', // Slate 500 (for focus:ring-secondary)
        
        // Semantic status colors
        success: '#059669', // Emerald 600
        warning: '#D97706', // Amber 600
        error: '#DC2626', // Red 600
      },
      fontFamily: {
        // "Plus Jakarta Sans" leads for Geometric Modern feel
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', '"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'card-hover': '0 20px 40px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', // Large soft shadow
        'glow': '0 0 40px -5px rgba(37, 99, 235, 0.4)', // Blue 600 Glow
        'glow-teal': '0 0 40px -5px rgba(6, 182, 212, 0.4)', // Teal Glow
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.15), transparent 70%)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.25rem', // Smooth curves
        '3xl': '1.5rem',
      }
    },
  },
  plugins: [],
}
