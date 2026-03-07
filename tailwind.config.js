/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin')

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
        // Semantic Mappings mapped to CSS Variables
        primary: {
            DEFAULT: 'var(--color-primary)',
            hover: 'var(--color-primary-hover)',
            light: 'var(--color-primary-light)',
        },
        accent: {
            DEFAULT: 'var(--color-accent)',
            hover: 'var(--color-accent-hover)',
        },
        
        // Text Colors
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        border: 'var(--color-border)',
        
        // Surface & Background Colors
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        secondary: 'var(--color-secondary)',
        
        // Semantic status colors
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)'
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', '"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'card': 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        'glow': '0 0 40px -5px rgba(37, 99, 235, 0.4)', 
        'glow-teal': '0 0 40px -5px rgba(6, 182, 212, 0.4)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.15), transparent 70%)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      }
    },
  },
  plugins: [
    plugin(function({ addVariant }) {
        addVariant('compact', '.compact-mode &')
    })
  ],
}
