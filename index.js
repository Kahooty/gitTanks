#!/usr/bin/env node
/**
 * index.js
 * Main entry point for gitTanks — Tank Battle Contribution Graph generator.
 *
 * Usage (local dev):
 *   node index.js --username <github_username> --token <github_token>
 *   node index.js --sample                    # fake data for testing only
 *
 * Usage (GitHub Action):
 *   Automatically called by action.yml with username + token
 */

const fs = require('fs');
const path = require('path');
const { fetchContributions, generateSampleGrid } = require('./src/fetch-contributions');
const { simulateGame } = require('./src/game-engine');
const { renderSVG } = require('./src/svg-renderer');

/**
 * Generate a deterministic-but-daily-unique seed from the current date.
 * Same date = same seed = same game. New day = new battle.
 */
function dateSeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

async function main() {
  const args = process.argv.slice(2);
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) {
      flags.username = args[++i];
    } else if (args[i] === '--token' && args[i + 1]) {
      flags.token = args[++i];
    } else if (args[i] === '--sample') {
      flags.sample = true;
    } else if (args[i] === '--output' && args[i + 1]) {
      flags.output = args[++i];
    } else if (args[i] === '--seed' && args[i + 1]) {
      flags.seed = parseInt(args[++i], 10);
    }
  }

  const outputDir = flags.output || path.join(process.cwd(), 'dist');
  const seed = flags.seed || dateSeed();
  const token = flags.token || process.env.GITHUB_TOKEN || null;

  console.log('🎮 gitTanks — Tank Battle Contribution Graph');
  console.log('=============================================');

  // --- Fetch contribution data ---
  let grid;
  if (flags.sample) {
    console.log('📋 Using sample data (local testing only)...');
    grid = generateSampleGrid();
  } else if (flags.username) {
    if (!token) {
      console.error('❌ --token is required to fetch real contribution data.');
      console.error('   GitHub GraphQL API requires authentication.');
      console.error('   Pass --token <ghp_...> or set GITHUB_TOKEN env var.');
      console.error('   For local testing, use --sample instead.');
      process.exit(1);
    }
    console.log(`📡 Fetching real contributions for ${flags.username}...`);
    try {
      grid = await fetchContributions(flags.username, token);
      console.log(`   ✅ Got ${grid.length} weeks of contribution data`);
    } catch (err) {
      console.error(`   ❌ Failed to fetch contributions: ${err.message}`);
      console.error('   This is real user data — refusing to fall back to placeholders.');
      process.exit(1);
    }
  } else {
    console.error('❌ No username provided.');
    console.error('   Usage: node index.js --username <name> --token <token>');
    console.error('   Or:    node index.js --sample');
    process.exit(1);
  }

  // --- Normalize grid to exactly 52 weeks × 7 days ---
  while (grid.length < 52) {
    grid.push(Array.from({ length: 7 }, () => ({ count: 0, level: 0, date: '' })));
  }
  if (grid.length > 52) grid = grid.slice(grid.length - 52);
  for (let c = 0; c < grid.length; c++) {
    while (grid[c].length < 7) {
      grid[c].push({ count: 0, level: 0, date: '' });
    }
  }

  // --- Grid stats ---
  let activityCount = 0;
  for (const col of grid) {
    for (const cell of col) {
      if (cell.level > 0) activityCount++;
    }
  }
  console.log(`\n🗺️  Battlefield: ${grid.length}×${grid[0].length} grid`);
  console.log(`   📊 Activity cells: ${activityCount}  (background only)`);
  console.log(`   🎲 Seed: ${seed}`);

  // --- Run simulation ---
  console.log('\n🎯 Simulating tank battle...');
  const gameResult = simulateGame(grid, { seed });

  const aliveTanks = gameResult.tanks.filter(t => t.alive);
  const winner = aliveTanks.length === 1 ? aliveTanks[0] : null;

  console.log(`   📊 Frames: ${gameResult.frames.length}`);
  console.log(`   🧱 Maze walls: ${gameResult.mazeWallCount}`);
  console.log(`   💥 Explosions: ${gameResult.explosions.length}`);
  console.log(`   🧱 Walls destroyed: ${gameResult.wallEvents.length}`);
  console.log(`   🎯 Bullets fired: ${gameResult.allBullets.length}`);

  for (const tank of gameResult.tanks) {
    const status = tank.alive ? '🏆 WINNER' : `💀 Frame ${tank.deathFrame || '?'}`;
    console.log(`   🔫 ${tank.name}: ${tank.kills} kills — ${status}`);
  }

  // --- Render SVGs ---
  console.log('\n🎨 Rendering SVGs...');

  const svgLight = renderSVG(gameResult, 'light');
  const svgDark = renderSVG(gameResult, 'dark');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const lightPath = path.join(outputDir, 'tank-contribution-graph.svg');
  const darkPath = path.join(outputDir, 'tank-contribution-graph-dark.svg');

  fs.writeFileSync(lightPath, svgLight, 'utf8');
  fs.writeFileSync(darkPath, svgDark, 'utf8');

  console.log(`   ✅ Light: ${lightPath} (${(svgLight.length / 1024).toFixed(1)} KB)`);
  console.log(`   ✅ Dark:  ${darkPath} (${(svgDark.length / 1024).toFixed(1)} KB)`);
  console.log('\n🏁 Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
