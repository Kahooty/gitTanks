#!/usr/bin/env node
/**
 * index.js
 * Main entry point for Tank Battle Contribution Graph generator.
 *
 * Usage:
 *   node index.js --username <github_username> [--token <github_token>] [--sample]
 */

const fs = require('fs');
const path = require('path');
const { fetchContributions, generateSampleGrid } = require('./src/fetch-contributions');
const { simulateGame } = require('./src/game-engine');
const { renderSVG } = require('./src/svg-renderer');

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

  console.log('🎮 Tank Battle Contribution Graph Generator');
  console.log('============================================');

  // --- Fetch or generate contribution data ---
  let grid;
  if (flags.sample) {
    console.log('📋 Using sample contribution data...');
    grid = generateSampleGrid();
  } else if (flags.username) {
    console.log(`📡 Fetching contributions for ${flags.username}...`);
    try {
      grid = await fetchContributions(flags.username, flags.token);
      console.log(`   ✅ Got ${grid.length} weeks of data`);
    } catch (err) {
      console.error(`   ❌ Failed to fetch: ${err.message}`);
      console.log('   📋 Falling back to sample data...');
      grid = generateSampleGrid();
    }
  } else {
    console.log('⚠️  No username provided. Use --username <name> or --sample');
    console.log('   📋 Using sample contribution data...');
    grid = generateSampleGrid();
  }

  // --- Ensure grid is properly sized ---
  // Pad or trim to exactly 52 columns and 7 rows
  while (grid.length < 52) {
    grid.push(Array(7).fill({ count: 0, level: 0, date: '' }));
  }
  if (grid.length > 52) grid = grid.slice(grid.length - 52);
  for (let c = 0; c < grid.length; c++) {
    while (grid[c].length < 7) {
      grid[c].push({ count: 0, level: 0, date: '' });
    }
  }

  // --- Analyze grid ---
  let wallCount = 0;
  let emptyCount = 0;
  for (const col of grid) {
    for (const cell of col) {
      if (cell.level > 0) wallCount++;
      else emptyCount++;
    }
  }
  console.log(`\n🗺️  Battlefield: ${grid.length}×${grid[0].length} grid`);
  console.log(`   🧱 Walls: ${wallCount}  |  ⬜ Open: ${emptyCount}`);

  // --- Run game simulation ---
  console.log('\n🎯 Simulating tank battle...');
  const gameResult = simulateGame(grid, {
    maxFrames: 600,
    shootCooldown: 10,
    moveCooldownAfterMove: 2,
    moveCooldownAfterShot: 3,
    turnFacingDelay: 1,
    bulletSpeed: 1,
    seed: flags.seed || 42,
  });

  const aliveTanks = gameResult.tanks.filter(t => t.alive);
  const winner = aliveTanks.length === 1 ? aliveTanks[0] : null;

  console.log(`   📊 Frames recorded: ${gameResult.frames.length}`);
  console.log(`   💥 Total explosions: ${gameResult.explosions.length}`);
  console.log(`   🧱 Walls destroyed: ${gameResult.wallEvents.length}`);
  console.log(`   🎯 Bullets fired: ${gameResult.allBullets.length}`);

  for (const tank of gameResult.tanks) {
    const status = tank.alive ? '🏆 WINNER' : `💀 Eliminated frame ${tank.deathFrame || '?'}`;
    console.log(`   🔫 ${tank.name} (${tank.color}): ${tank.kills} kills — ${status}`);
  }

  // --- Render SVGs ---
  console.log('\n🎨 Rendering SVGs...');

  const svgLight = renderSVG(gameResult, 'light', flags.username || 'demo');
  const svgDark = renderSVG(gameResult, 'dark', flags.username || 'demo');

  // --- Save output ---
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const lightPath = path.join(outputDir, 'tank-contribution-graph.svg');
  const darkPath = path.join(outputDir, 'tank-contribution-graph-dark.svg');

  fs.writeFileSync(lightPath, svgLight, 'utf8');
  fs.writeFileSync(darkPath, svgDark, 'utf8');

  console.log(`   ✅ Light theme: ${lightPath} (${(svgLight.length / 1024).toFixed(1)} KB)`);
  console.log(`   ✅ Dark theme:  ${darkPath} (${(svgDark.length / 1024).toFixed(1)} KB)`);
  console.log('\n🏁 Done! Tank battle generated successfully.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
