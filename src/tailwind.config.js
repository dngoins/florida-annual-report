/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Confidence level colors
        confidence: {
          high: {
            bg: '#dcfce7',      // green-100
            border: '#22c55e',  // green-500
            text: '#166534',    // green-800
          },
          medium: {
            bg: '#fef9c3',      // yellow-100
            border: '#eab308',  // yellow-500
            text: '#854d0e',    // yellow-800
          },
          low: {
            bg: '#fee2e2',      // red-100
            border: '#ef4444',  // red-500
            text: '#991b1b',    // red-800
          },
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
