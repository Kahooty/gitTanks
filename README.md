# 🎯 gitTanks

Animated tank battle on your GitHub contribution graph — generated daily as an SVG.

> Inspired by [pacman-contribution-graph](https://github.com/abozanona/pacman-contribution-graph) and [snk](https://github.com/Platane/snk)

## How It Works

A **randomly generated maze** of thin walls is drawn in the gaps between contribution cells. Four tanks spawn in the corners, navigate the maze, blast through walls, and fight to be the last one standing.

- **Contribution cells** → background color only (green shades reflect your activity)
- **Maze walls** → light outline lines between cells, randomly generated each day via a seeded algorithm (DFS + extra openings)
- **Date-based seed** → same day = same battle; new day = new maze

## Setup

### 1. Profile repo

Create a repository matching your GitHub username (e.g. `Kahooty/Kahooty`).

### 2. Workflow

`.github/workflows/tank-battle.yml`:

```yaml
name: Generate Tank Battle

on:
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  generate:
    permissions:
      contents: write
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Generate SVGs
        uses: Kahooty/gitTanks@main
        with:
          github_user_name: ${{ github.repository_owner }}

      - name: Push to output branch
        uses: crazy-max/ghaction-github-pages@v3.1.0
        with:
          target_branch: output
          build_dir: dist
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 3. Embed in README

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/<user>/<user>/output/tank-contribution-graph-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/<user>/<user>/output/tank-contribution-graph.svg">
  <img alt="tank battle contribution graph" src="https://raw.githubusercontent.com/<user>/<user>/output/tank-contribution-graph.svg">
</picture>
```

Replace `<user>` with your GitHub username.

## Local Dev

```bash
node index.js --sample              # sample data, no token needed
node index.js --sample --seed 999   # reproducible seed
node index.js --username <user> --token <ghp_token>
```

Output → `dist/tank-contribution-graph.svg` and `dist/tank-contribution-graph-dark.svg`

## Scoreboard

| Symbol | Meaning |
|--------|---------|
| 💥N | Kill count |
| 💀 | Destroyed (appears on death) |
| 🏆 | Winner prefix |
| 👑 | Crown (animated on victory) |

## Known Issues

- **Wall destruction / path-clearing**: Wall destruction is a bit unreliable. Working on patch to address.

## License

MIT
