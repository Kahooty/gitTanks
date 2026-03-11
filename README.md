# 🎯 gitTanks

Git contribution graph activity stylized as a retro-style tanks game.

Four tanks spawn in the corners of your contribution grid — your real commit history forms the walls and cover. Tanks navigate, blast through obstacles, and eliminate each other in a fully automated animated SVG that updates daily.

> Inspired by [pacman-contribution-graph](https://github.com/abozanona/pacman-contribution-graph) and [snk](https://github.com/Platane/snk)

---

## How It Works

Your GitHub contribution data becomes the battlefield. Every day with activity is a wall; empty days are open ground. One shot destroys any wall. The game uses a date-based seed so each day generates a unique battle from your real activity.

| Contribution Level | In-Game |
|---|---|
| **NONE** | Open ground |
| **FIRST_QUARTILE** | Wall (1 shot) |
| **SECOND_QUARTILE** | Wall (1 shot) |
| **THIRD_QUARTILE** | Wall (1 shot) |
| **FOURTH_QUARTILE** | Wall (1 shot) |

---

## Quick Setup

### 1. Create your profile repo

Create a repository with your exact GitHub username (e.g. `Kahooty/Kahooty`).

### 2. Add the workflow

Create `.github/workflows/tank-battle.yml`:

```yaml
name: Generate Tank Battle

on:
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  generate:
    permissions:
      contents: write
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: Generate tank-contribution-graph.svg
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

### 3. Add to your README

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Kahooty/Kahooty/output/tank-contribution-graph-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Kahooty/Kahooty/output/tank-contribution-graph.svg">
  <img alt="tank battle contribution graph" src="https://raw.githubusercontent.com/Kahooty/Kahooty/output/tank-contribution-graph.svg">
</picture>
```

Replace `Kahooty` with your GitHub username.

### 4. Trigger it

Push to main, or go to **Actions** → **Generate Tank Battle** → **Run workflow**.

---

## Scoreboard

The animated scoreboard tracks each tank:

- **💥N** — kill count per tank
- **💀** — appears on a tank's icon the frame it's destroyed
- **🏆** — prefixed to the winning tank's name
- **👑** — animated crown above the last tank standing

---

## Local Development

```bash
git clone https://github.com/Kahooty/gitTanks.git
cd gitTanks

# Test with sample data (no token needed)
node index.js --sample

# Generate with real GitHub data
node index.js --username Kahooty --token ghp_your_token_here

# Force a specific seed (same seed = same game)
node index.js --sample --seed 999
```

Output: `dist/tank-contribution-graph.svg` and `dist/tank-contribution-graph-dark.svg`

---

## Project Structure

```
gitTanks/
├── action.yml                 # GitHub Action definition
├── index.js                   # CLI entry point
├── package.json
├── src/
│   ├── fetch-contributions.js # GitHub GraphQL API — fetches real activity
│   ├── game-engine.js         # Tank battle simulation
│   ├── svg-renderer.js        # Animated SVG output
│   └── themes.js              # Light / dark color themes
├── .github/workflows/
│   └── main.yml               # Example workflow
└── README.md
```

---

## License

MIT

---

_generated with [Kahooty/gitTanks](https://github.com/Kahooty/gitTanks)_
