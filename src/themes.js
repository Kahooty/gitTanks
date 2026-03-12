/**
 * themes.js
 * Color themes for Tank Battle contribution graph
 */

const themes = {
  light: {
    name: 'github-light',
    background: '#ffffff',
    gridBackground: '#ebedf0',
    gridBorder: '#d0d7de',
    text: '#1f2328',
    textMuted: '#656d76',

    // Contribution cell colors (background only — matching GitHub's green scheme)
    wallColors: {
      0: 'transparent',
      1: '#9be9a8',
      2: '#40c463',
      3: '#30a14e',
      4: '#216e39',
    },

    // Maze wall line color (drawn in gaps between cells)
    mazeWall: '#9ba3ad',
    mazeBorder: '#b0b8c1',

    // Tank colors
    tanks: {
      'tank-green':  { body: '#2d6a2e', turret: '#1a4a1a', track: '#4a9e4a', label: 'Alpha' },
      'tank-blue':   { body: '#2563eb', turret: '#1d4ed8', track: '#60a5fa', label: 'Bravo' },
      'tank-red':    { body: '#dc2626', turret: '#b91c1c', track: '#f87171', label: 'Charlie' },
      'tank-orange': { body: '#ea580c', turret: '#c2410c', track: '#fb923c', label: 'Delta' },
    },

    bullet: '#1f2328',
    bulletTrail: 'rgba(31,35,40,0.3)',
    explosion: '#fbbf24',
    explosionRing: '#f97316',
    wallDamage: '#fecaca',
    groundMark: '#d1d5db',

    hudBg: 'rgba(255,255,255,0.9)',
    hudBorder: '#d0d7de',
  },

  dark: {
    name: 'github-dark',
    background: '#0d1117',
    gridBackground: '#161b22',
    gridBorder: '#30363d',
    text: '#f0f6fc',
    textMuted: '#8b949e',

    // Contribution cell colors (background only — GitHub dark greens)
    wallColors: {
      0: 'transparent',
      1: '#0e4429',
      2: '#006d32',
      3: '#26a641',
      4: '#39d353',
    },

    // Maze wall line color
    mazeWall: '#484f58',
    mazeBorder: '#3d444d',

    // Tank colors (brighter for dark bg)
    tanks: {
      'tank-green':  { body: '#4ade80', turret: '#22c55e', track: '#86efac', label: 'Alpha' },
      'tank-blue':   { body: '#60a5fa', turret: '#3b82f6', track: '#93c5fd', label: 'Bravo' },
      'tank-red':    { body: '#f87171', turret: '#ef4444', track: '#fca5a5', label: 'Charlie' },
      'tank-orange': { body: '#fb923c', turret: '#f97316', track: '#fdba74', label: 'Delta' },
    },

    bullet: '#f0f6fc',
    bulletTrail: 'rgba(240,246,252,0.3)',
    explosion: '#fbbf24',
    explosionRing: '#f97316',
    wallDamage: '#4b2020',
    groundMark: '#21262d',

    hudBg: 'rgba(13,17,23,0.9)',
    hudBorder: '#30363d',
  }
};

module.exports = { themes };
