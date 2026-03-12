/**
 * fetch-contributions.js
 * Fetches GitHub contribution data via GraphQL API
 */

// Use built-in fetch (Node 18+) or fall back to node-fetch
let fetch;
if (typeof globalThis.fetch === 'function') {
  fetch = globalThis.fetch;
} else {
  try { fetch = require('node-fetch'); } catch(e) {
    throw new Error('No fetch available. Use Node 18+ or install node-fetch.');
  }
}

const CONTRIBUTION_QUERY = `
query($username: String!) {
  user(login: $username) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            contributionLevel
            date
            weekday
          }
        }
      }
    }
  }
}
`;

/**
 * Contribution levels determine cell background color (visual only).
 * Maze walls are generated separately — activity data does not affect gameplay.
 */
const LEVEL_MAP = {
  'NONE': 0,
  'FIRST_QUARTILE': 1,
  'SECOND_QUARTILE': 2,
  'THIRD_QUARTILE': 3,
  'FOURTH_QUARTILE': 4
};

async function fetchContributions(username, token) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: CONTRIBUTION_QUERY,
      variables: { username }
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  if (!data.data || !data.data.user) {
    throw new Error(`User "${username}" not found on GitHub.`);
  }

  const weeks = data.data.user.contributionsCollection.contributionCalendar.weeks;

  // Build a 2D grid: grid[col][row] where col=week (0-51), row=day (0-6)
  const grid = [];
  for (let w = 0; w < weeks.length; w++) {
    const col = [];
    for (let d = 0; d < weeks[w].contributionDays.length; d++) {
      const day = weeks[w].contributionDays[d];
      col.push({
        count: day.contributionCount,
        level: LEVEL_MAP[day.contributionLevel] || 0,
        date: day.date
      });
    }
    grid.push(col);
  }

  return grid;
}

/**
 * Generate a sample contribution grid for testing (no API needed)
 */
function generateSampleGrid() {
  const grid = [];
  const cols = 52;
  const rows = 7;

  let seed = 42;
  function rand() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let c = 0; c < cols; c++) {
    const col = [];
    for (let r = 0; r < rows; r++) {
      const v = rand();
      let level;
      // ~50% empty for playable grid, with corridors
      if (v < 0.50) level = 0;
      else if (v < 0.70) level = 1;
      else if (v < 0.85) level = 2;
      else if (v < 0.95) level = 3;
      else level = 4;
      col.push({
        count: level * 3,
        level,
        date: `2025-01-01`
      });
    }
    grid.push(col);
  }

  // Ensure horizontal corridors exist (clear middle rows partially)
  for (let c = 0; c < cols; c++) {
    if (rand() < 0.6) grid[c][3].level = 0; // middle row mostly open
    if (rand() < 0.4) grid[c][1].level = 0; // top corridor
    if (rand() < 0.4) grid[c][5].level = 0; // bottom corridor
  }

  return grid;
}

module.exports = { fetchContributions, generateSampleGrid, LEVEL_MAP };
