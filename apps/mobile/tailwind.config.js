// Owner: shared mobile scaffold (Charles) — NativeWind v4 uses Tailwind CSS v3.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#20201C',
        paper: '#F7F3EC',
        'paper-raised': '#FFFFFF',
        ember: '#E8703A',
        'ember-ink': '#B8501F',
        sage: '#5B7A6B',
        line: '#E4DDD0',
        muted: '#8A8378',
      },
      fontFamily: {
        display: ['Fraunces_700Bold'],
        'display-medium': ['Fraunces_600SemiBold'],
        body: ['PublicSans_400Regular'],
        'body-medium': ['PublicSans_500Medium'],
        'body-semibold': ['PublicSans_600SemiBold'],
        'body-bold': ['PublicSans_700Bold'],
      },
      borderRadius: {
        s: '8px',
        m: '14px',
        l: '22px',
      },
    },
  },
  plugins: [],
};
