# gitTanks — Agent Guide

Brief, accurate context for AI agents working on gitTanks.

## Current Shape

- **What:** CLI tool that transforms GitHub contribution graphs into animated SVG tank battles
- **Stack:** Node.js 20+, vanilla JavaScript, zero required dependencies (node-fetch optional for Node <18)
- **Output:** SMIL-animated SVGs (light + dark themes), self-contained with no runtime JS
- **Deployment:** GitHub Action (daily cron at midnight UTC) outputs to `output` branch for README embedding
- **Simulation:** Deterministic — date-based seeded RNG means same day = same battle
- **Size:** ~1,800 LOC across 5 source files

## Key Files

| File | Purpose |
|------|---------|
| `index.js` | CLI entry point & orchestrator (args, grid normalization, output) |
| `src/game-engine.js` | Core simulation: maze generation, tank AI (BFS pathfinding), bullet physics, multi-round system (827 LOC) |
| `src/svg-renderer.js` | SMIL animation builder: tanks, bullets, explosions, tread marks, scoreboard (607 LOC) |
| `src/fetch-contributions.js` | GitHub GraphQL API client + `generateSampleGrid()` for testing |
| `src/themes.js` | Light/dark color palettes for contribution cells, tanks, explosions |
| `action.yml` | GitHub Action composite definition |
| `package.json` | npm config (node-fetch is optional dep only) |

## Local Workflow

```bash
npm install                                            # optional — no required deps
node index.js --sample                                # generate with fake contribution data
node index.js --sample --seed 12345                   # reproducible seed override
node index.js --sample --output ./out                 # custom output directory
node index.js --username <user> --token <ghp_...>     # real GitHub data
```

- Output: `dist/tank-contribution-graph.svg` (light) + `dist/tank-contribution-graph-dark.svg` (dark)
- `--sample` generates deterministic fake contribution data (no GitHub token needed)
- `--seed <number>` overrides the date-based deterministic seed

## Architecture

```
CLI invocation (index.js)
  |
  +-- fetchContributions() or generateSampleGrid()
  |     GitHub GraphQL API (contributionsCollection query)
  |     Returns 2D grid: grid[col][row], col=week(0-51), row=day(0-6)
  |
  +-- simulateGame(grid, { seed })
  |     +-- Maze generation (randomized DFS, ~40% extra wall removal)
  |     +-- 4 tanks spawn at corners (Alpha/Bravo/Charlie/Delta)
  |     +-- AI decision tree: shoot > retreat > evade > strafe > chase > pathfind > wander
  |     +-- BFS pathfinding for line-of-sight and movement
  |     +-- Bullet physics: wall destruction, tank kills, explosions
  |     +-- Multi-round: 3 rounds per game, maze regenerates between rounds
  |     +-- Frame-by-frame recording for animation keyframes
  |
  +-- renderSVG(gameResult, theme)
        +-- Contribution heatmap background (visual only, no gameplay impact)
        +-- Maze walls with per-round opacity animations
        +-- Tank movement + rotation (SMIL spline easing, shortest-arc rotation)
        +-- Bullet trajectories + multi-layer explosions
        +-- Scoreboard with kill counts and winner crown
        +-- 350ms per frame, loops indefinitely
```

## Game Mechanics

- **Grid:** 52x7 (one year of GitHub contributions), always normalized
- **Tanks:** 4 AI agents, corner spawn, distinct colors per theme
- **AI:** Priority-based decision tree with BFS pathfinding
- **Combat:** Line-of-sight shooting, wall destruction opens new paths
- **Rounds:** 3 per game, ~600 frames max per round, maze regenerates
- **Seeding:** LCG (linear congruential generator) with YYYYMMDD date seed

## Safety / Quality Rails

- No tests exist — validate changes with `node index.js --sample` and visual SVG inspection
- Never commit GitHub tokens; the Action uses `${{ github.token }}`
- SVG output is self-contained SMIL animation — no external dependencies at render time
- Grid is always normalized to 52x7 regardless of input data shape
- Contribution data is visual only — does not affect maze generation or gameplay
- node-fetch is optional (Node 18+ has native fetch)

## Useful Notes

- No dev server — this is a CLI tool, no port assignment
- GitHub Action uses composite runner: Node 20 setup, npm install, generate, copy to workspace
- SVGs embed in GitHub READMEs via `<picture>` tag with prefers-color-scheme media queries
- Total animation duration: frame count x 350ms (~3.5 min for 600 frames), loops indefinitely
