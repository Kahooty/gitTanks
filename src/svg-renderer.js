/**
 * svg-renderer.js
 * Converts game recording → animated SVG with smooth SMIL animations.
 *
 * Activity cells are rendered as background only (contribution colors).
 * Maze walls are drawn as thin lines in the gaps between cells.
 */

const { themes } = require('./themes');

const CELL_SIZE = 12;
const CELL_GAP = 2;
const CELL_PITCH = CELL_SIZE + CELL_GAP;
const GRID_LEFT = 24;
const GRID_TOP = 10;
const TANK_SIZE = 10;
const BULLET_R = 2;
const FRAME_MS = 350;
const BORDER_OFFSET = 1.5;
const BORDER_PADDING = BORDER_OFFSET * 2;

function cellCenter(col, row) {
  return {
    x: GRID_LEFT + col * CELL_PITCH + CELL_SIZE / 2,
    y: GRID_TOP + row * CELL_PITCH + CELL_SIZE / 2,
  };
}

function shortestArc(current, target) {
  let diff = target - current;
  while (diff > 180) diff -= 360;
  while (diff <= -180) diff += 360;
  return current + diff;
}

function renderSVG(gameResult, themeName = 'light') {
  const theme = themes[themeName] || themes.light;
  const { frames, allBullets, explosions, wallEvents, muzzleFlashes,
          tanks, grid, cols, rows, initialGrid, maze, rounds } = gameResult;

  const aliveTanks = tanks.filter(t => t.alive);
  const winner = aliveTanks.length === 1 ? aliveTanks[0] : null;

  const totalFrames = frames.length;
  const dur = ((totalFrames * FRAME_MS) / 1000).toFixed(1) + 's';

  const svgWidth = GRID_LEFT + cols * CELL_PITCH + 24;
  const svgHeight = GRID_TOP + rows * CELL_PITCH + 66;

  function ft(f) {
    return (Math.min(Math.max(f, 0), totalFrames - 1) / (totalFrames - 1)).toFixed(6);
  }

  const EASE = '0.25 0.1 0.25 1';
  const LINEAR = '0 0 1 1';
  const EASE_OUT = '0 0 0.58 1';

  // ─── Tank animation data builder ────────────────────────────────────

  function tankAnimationData(tankId) {
    const rawPos = [];
    const rawAngle = [];
    const rawOp = [];
    let died = false;
    let deathFrame = totalFrames;

    let runningAngle = null;

    for (let f = 0; f < totalFrames; f++) {
      const t = frames[f].tanks.find(t => t.id === tankId);
      if (!t) break;

      const c = cellCenter(t.x, t.y);
      rawPos.push({ x: c.x, y: c.y });

      const nominalAngle = t.dir.angle;
      if (runningAngle === null) {
        runningAngle = nominalAngle;
      } else {
        runningAngle = shortestArc(runningAngle, nominalAngle);
      }
      rawAngle.push(runningAngle);

      if (!t.alive && !died) { died = true; deathFrame = f; }
      rawOp.push(t.alive ? 1 : 0);
    }

    const posKF = [];
    const posSplines = [];

    posKF.push({ pos: `${rawPos[0].x},${rawPos[0].y}`, time: ft(0) });

    for (let i = 1; i < rawPos.length; i++) {
      const moved = (rawPos[i].x !== rawPos[i - 1].x || rawPos[i].y !== rawPos[i - 1].y);
      if (moved) {
        const anchorTime = ft(i - 1);
        if (posKF[posKF.length - 1].time !== anchorTime) {
          posKF.push({ pos: `${rawPos[i - 1].x},${rawPos[i - 1].y}`, time: anchorTime });
          posSplines.push(LINEAR);
        }
        posKF.push({ pos: `${rawPos[i].x},${rawPos[i].y}`, time: ft(i) });
        posSplines.push(EASE);
      }
    }

    const lastPos = rawPos[rawPos.length - 1];
    const lastTime = ft(rawPos.length - 1);
    if (posKF[posKF.length - 1].time !== lastTime) {
      posKF.push({ pos: `${lastPos.x},${lastPos.y}`, time: lastTime });
      posSplines.push(LINEAR);
    }

    const rotKF = [];
    const rotSplines = [];

    rotKF.push({ val: rawAngle[0], time: ft(0) });

    for (let i = 1; i < rawAngle.length; i++) {
      if (rawAngle[i] !== rawAngle[i - 1]) {
        const holdTime = ft(i - 1);
        if (rotKF[rotKF.length - 1].time !== holdTime) {
          rotKF.push({ val: rawAngle[i - 1], time: holdTime });
          rotSplines.push(LINEAR);
        }
        rotKF.push({ val: rawAngle[i], time: ft(i) });
        rotSplines.push(EASE);
      }
    }

    const lastRotTime = ft(rawAngle.length - 1);
    if (rotKF[rotKF.length - 1].time !== lastRotTime) {
      rotKF.push({ val: rawAngle[rawAngle.length - 1], time: lastRotTime });
      rotSplines.push(LINEAR);
    }

    const opKF = [];
    opKF.push({ val: rawOp[0], time: ft(0) });
    for (let i = 1; i < rawOp.length; i++) {
      if (rawOp[i] !== rawOp[i - 1]) {
        const holdTime = ft(i - 1);
        if (opKF[opKF.length - 1].time !== holdTime) {
          opKF.push({ val: rawOp[i - 1], time: holdTime });
        }
        opKF.push({ val: rawOp[i], time: ft(i) });
      }
    }
    const lastOpTime = ft(rawOp.length - 1);
    if (opKF[opKF.length - 1].time !== lastOpTime) {
      opKF.push({ val: rawOp[rawOp.length - 1], time: lastOpTime });
    }

    return {
      posValues: posKF.map(k => k.pos).join(';'),
      posKeyTimes: posKF.map(k => k.time).join(';'),
      posKeySplines: posSplines.join('; '),
      posCount: posKF.length,

      rotValues: rotKF.map(k => `${k.val}`).join(';'),
      rotKeyTimes: rotKF.map(k => k.time).join(';'),
      rotKeySplines: rotSplines.join('; '),
      rotCount: rotKF.length,

      opValues: opKF.map(k => `${k.val}`).join(';'),
      opKeyTimes: opKF.map(k => k.time).join(';'),

      died,
      deathFrame,
    };
  }

  // ═══════════════════════ SVG CONSTRUCTION ═══════════════════════════

  let svg = '';

  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">\n`;

  // ── Styles ──
  svg += `<style>\n`;
  svg += `  .bg { fill: ${theme.background}; }\n`;
  svg += `  .grid-cell { rx: 2; ry: 2; }\n`;
  svg += `  .sub-text { font: 9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; fill: ${theme.textMuted}; }\n`;
  svg += `  .score-name { font: bold 9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }\n`;
  svg += `  .score-stat { font: 9px monospace; }\n`;
  svg += `  .tank-body { stroke: ${theme.background}; stroke-width: 0.5; }\n`;
  svg += `  .turret { stroke-width: 2.5; stroke-linecap: round; }\n`;
  svg += `  .maze-wall { stroke: ${theme.mazeWall}; stroke-width: 1.5; stroke-linecap: round; }\n`;
  svg += `</style>\n`;

  // ── Background ──
  svg += `<rect class="bg" width="${svgWidth}" height="${svgHeight}" />\n`;

  // ── Grid: contribution cells as background only ──
  svg += `<g id="grid">\n`;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = GRID_LEFT + c * CELL_PITCH;
      const y = GRID_TOP + r * CELL_PITCH;
      const level = initialGrid[c][r].level;
      const fill = level > 0 ? theme.wallColors[level] : theme.gridBackground;
      svg += `  <rect class="grid-cell" x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${fill}" />\n`;
    }
  }
  svg += `</g>\n`;

  // ── Maze walls: thin lines in the gaps between cells (per-round) ──
  svg += `<g id="maze-walls">\n`;

  // Border rectangle around the entire grid
  const borderX = GRID_LEFT - BORDER_OFFSET;
  const borderY = GRID_TOP - BORDER_OFFSET;
  const borderW = cols * CELL_PITCH - CELL_GAP + BORDER_PADDING;
  const borderH = rows * CELL_PITCH - CELL_GAP + BORDER_PADDING;
  svg += `  <rect x="${borderX}" y="${borderY}" width="${borderW}" height="${borderH}" fill="none" stroke="${theme.mazeBorder}" stroke-width="1.5" rx="1" />\n`;

  // Determine which rounds data to use
  const activeRounds = rounds && rounds.length > 0 ? rounds : [{
    startFrame: 0,
    endFrame: totalFrames - 1,
    maze: { initialHWalls: maze.initialHWalls, initialVWalls: maze.initialVWalls },
    wallEvents: wallEvents,
  }];

  // Render walls for each round
  for (let ri = 0; ri < activeRounds.length; ri++) {
    const round = activeRounds[ri];
    const roundStartF = round.startFrame;
    const roundEndF = round.endFrame;
    const isFirstRound = ri === 0;
    const isLastRound = ri === activeRounds.length - 1;

    // Horizontal walls (between rows)
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows - 1; r++) {
        if (!round.maze.initialHWalls[c][r]) continue;
        const y = GRID_TOP + r * CELL_PITCH + CELL_SIZE + CELL_GAP / 2;
        const x1 = GRID_LEFT + c * CELL_PITCH - 1;
        const x2 = GRID_LEFT + c * CELL_PITCH + CELL_SIZE + 1;
        const destruction = round.wallEvents.find(e => e.type === 'h' && e.col === c && e.row === r);

        // Build opacity keyframes: fade-in at round start, visible during round, fade-out on destroy or round end
        const times = [];
        const vals = [];

        // Before round start: hidden (except first round)
        if (!isFirstRound) {
          times.push(ft(Math.max(0, roundStartF - 2)));
          vals.push('0');
          times.push(ft(roundStartF));
          vals.push('1');
        } else {
          times.push('0');
          vals.push('1');
        }

        if (destruction) {
          const preT = ft(Math.max(roundStartF, destruction.frame - 1));
          const destT = ft(destruction.frame);
          const fadeT = ft(Math.min(destruction.frame + 4, totalFrames - 1));
          if (parseFloat(preT) > parseFloat(times[times.length - 1])) {
            times.push(preT);
            vals.push('1');
          }
          times.push(destT);
          vals.push('0.3');
          times.push(fadeT);
          vals.push('0');
        } else {
          // Survive until round end, then fade out (except last round)
          if (!isLastRound) {
            const endT = ft(roundEndF);
            const fadeOutT = ft(Math.min(roundEndF + 2, totalFrames - 1));
            if (parseFloat(endT) > parseFloat(times[times.length - 1])) {
              times.push(endT);
              vals.push('1');
            }
            times.push(fadeOutT);
            vals.push('0');
          }
        }

        // Ensure we end at time 1
        if (parseFloat(times[times.length - 1]) < 1) {
          times.push('1');
          vals.push(vals[vals.length - 1]);
        }

        svg += `  <line class="maze-wall" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}">\n`;
        svg += `    <animate attributeName="opacity" values="${vals.join(';')}" keyTimes="${times.join(';')}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
        svg += `  </line>\n`;
      }
    }

    // Vertical walls (between columns)
    for (let c = 0; c < cols - 1; c++) {
      for (let r = 0; r < rows; r++) {
        if (!round.maze.initialVWalls[c][r]) continue;
        const x = GRID_LEFT + c * CELL_PITCH + CELL_SIZE + CELL_GAP / 2;
        const y1 = GRID_TOP + r * CELL_PITCH - 1;
        const y2 = GRID_TOP + r * CELL_PITCH + CELL_SIZE + 1;
        const destruction = round.wallEvents.find(e => e.type === 'v' && e.col === c && e.row === r);

        const times = [];
        const vals = [];

        if (!isFirstRound) {
          times.push(ft(Math.max(0, roundStartF - 2)));
          vals.push('0');
          times.push(ft(roundStartF));
          vals.push('1');
        } else {
          times.push('0');
          vals.push('1');
        }

        if (destruction) {
          const preT = ft(Math.max(roundStartF, destruction.frame - 1));
          const destT = ft(destruction.frame);
          const fadeT = ft(Math.min(destruction.frame + 4, totalFrames - 1));
          if (parseFloat(preT) > parseFloat(times[times.length - 1])) {
            times.push(preT);
            vals.push('1');
          }
          times.push(destT);
          vals.push('0.3');
          times.push(fadeT);
          vals.push('0');
        } else {
          if (!isLastRound) {
            const endT = ft(roundEndF);
            const fadeOutT = ft(Math.min(roundEndF + 2, totalFrames - 1));
            if (parseFloat(endT) > parseFloat(times[times.length - 1])) {
              times.push(endT);
              vals.push('1');
            }
            times.push(fadeOutT);
            vals.push('0');
          }
        }

        if (parseFloat(times[times.length - 1]) < 1) {
          times.push('1');
          vals.push(vals[vals.length - 1]);
        }

        svg += `  <line class="maze-wall" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}">\n`;
        svg += `    <animate attributeName="opacity" values="${vals.join(';')}" keyTimes="${times.join(';')}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
        svg += `  </line>\n`;
      }
    }
  }
  svg += `</g>\n`;

  // ── Tread marks ──
  svg += `<g id="trails" opacity="0.12">\n`;
  for (const tank of tanks) {
    const tankTheme = theme.tanks[tank.color];
    const visited = new Set();
    for (let f = 0; f < totalFrames; f++) {
      const tf = frames[f].tanks.find(t => t.id === tank.id);
      if (!tf || !tf.alive) break;
      const key = `${tf.x},${tf.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const cx = GRID_LEFT + tf.x * CELL_PITCH;
      const cy = GRID_TOP + tf.y * CELL_PITCH;
      const preT = ft(Math.max(0, f - 1));
      const markT = ft(f);
      svg += `  <rect x="${cx + 2}" y="${cy + 2}" width="${CELL_SIZE - 4}" height="${CELL_SIZE - 4}" fill="${tankTheme.body}" opacity="0">\n`;
      svg += `    <animate attributeName="opacity" values="0;0;1" keyTimes="0;${preT};${markT}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `  </rect>\n`;
    }
  }
  svg += `</g>\n`;

  // ── Explosions ──
  svg += `<g id="explosions">\n`;
  for (const exp of explosions) {
    const center = cellCenter(exp.x, exp.y);
    const isLarge = exp.type === 'tank';

    if (isLarge) {
      // Enhanced tank death explosion
      const maxR = 14;
      const t0 = ft(exp.frame);
      const t1 = ft(Math.min(exp.frame + 2, totalFrames - 1));
      const t2 = ft(Math.min(exp.frame + 5, totalFrames - 1));
      const t3 = ft(Math.min(exp.frame + 10, totalFrames - 1));

      // White/yellow flash (inner core)
      svg += `  <circle cx="${center.x}" cy="${center.y}" r="0" fill="#ffffcc" opacity="0">\n`;
      svg += `    <animate attributeName="r" values="0;0;${maxR * 0.6};0" keyTimes="0;${t0};${t1};${t2}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `    <animate attributeName="opacity" values="0;0;1;0" keyTimes="0;${t0};${t1};${t2}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `  </circle>\n`;

      // Yellow-orange fireball
      svg += `  <circle cx="${center.x}" cy="${center.y}" r="0" fill="#ff8800" opacity="0">\n`;
      svg += `    <animate attributeName="r" values="0;0;${maxR * 0.8};${maxR * 0.3}" keyTimes="0;${t0};${t1};${t2}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `    <animate attributeName="opacity" values="0;0;0.9;0" keyTimes="0;${t0};${t1};${t2}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `  </circle>\n`;

      // Red outer blast
      svg += `  <circle cx="${center.x}" cy="${center.y}" r="0" fill="#ff4444" opacity="0">\n`;
      svg += `    <animate attributeName="r" values="0;0;${maxR};${maxR * 0.4}" keyTimes="0;${t0};${t2};${t3}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `    <animate attributeName="opacity" values="0;0;0.8;0" keyTimes="0;${t0};${t2};${t3}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `  </circle>\n`;

      // Debris particles flying outward
      const debrisCount = 6;
      for (let d = 0; d < debrisCount; d++) {
        const angle = (d / debrisCount) * Math.PI * 2;
        const dist = maxR + 8;
        const px = (center.x + Math.cos(angle) * dist).toFixed(1);
        const py = (center.y + Math.sin(angle) * dist).toFixed(1);
        svg += `  <circle cx="${center.x}" cy="${center.y}" r="1.5" fill="#ffaa00" opacity="0">\n`;
        svg += `    <animate attributeName="cx" values="${center.x};${center.x};${px};${px}" keyTimes="0;${t0};${t2};${t3}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
        svg += `    <animate attributeName="cy" values="${center.y};${center.y};${py};${py}" keyTimes="0;${t0};${t2};${t3}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
        svg += `    <animate attributeName="opacity" values="0;0;1;0" keyTimes="0;${t0};${t1};${t3}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
        svg += `    <animate attributeName="r" values="1.5;1.5;1.5;0.3" keyTimes="0;${t0};${t2};${t3}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
        svg += `  </circle>\n`;
      }

      // Shockwave ring
      svg += `  <circle cx="${center.x}" cy="${center.y}" r="0" fill="none" stroke="${theme.explosionRing}" stroke-width="2" opacity="0">\n`;
      svg += `    <animate attributeName="r" values="0;0;${maxR + 6};${maxR + 12}" keyTimes="0;${t0};${t2};${t3}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `    <animate attributeName="opacity" values="0;0;0.7;0" keyTimes="0;${t0};${t1};${t3}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `  </circle>\n`;

      // Smoke cloud (lingers)
      const tSmoke = ft(Math.min(exp.frame + 14, totalFrames - 1));
      svg += `  <circle cx="${center.x}" cy="${center.y}" r="0" fill="#555555" opacity="0">\n`;
      svg += `    <animate attributeName="r" values="0;0;${maxR * 0.4};${maxR * 0.9}" keyTimes="0;${t0};${t2};${tSmoke}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `    <animate attributeName="opacity" values="0;0;0.25;0" keyTimes="0;${t0};${t2};${tSmoke}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `  </circle>\n`;
    } else {
      // Wall destruction explosion (unchanged)
      const maxR = 7;
      const color1 = theme.explosion;
      const color2 = theme.explosionRing;
      const t0 = ft(exp.frame);
      const t1 = ft(Math.min(exp.frame + 3, totalFrames - 1));
      const t2 = ft(Math.min(exp.frame + 8, totalFrames - 1));

      svg += `  <circle cx="${center.x}" cy="${center.y}" r="0" fill="${color1}" opacity="0">\n`;
      svg += `    <animate attributeName="r" values="0;0;${maxR};${maxR * 0.3}" keyTimes="0;${t0};${t1};${t2}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `    <animate attributeName="opacity" values="0;0;0.9;0" keyTimes="0;${t0};${t1};${t2}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `  </circle>\n`;
      svg += `  <circle cx="${center.x}" cy="${center.y}" r="0" fill="none" stroke="${color2}" stroke-width="1.5" opacity="0">\n`;
      svg += `    <animate attributeName="r" values="0;0;${maxR + 4};${maxR + 8}" keyTimes="0;${t0};${t1};${t2}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `    <animate attributeName="opacity" values="0;0;0.6;0" keyTimes="0;${t0};${t1};${t2}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `  </circle>\n`;
    }
  }
  svg += `</g>\n`;

  // ── Muzzle flashes ──
  svg += `<g id="muzzle-flashes">\n`;
  if (muzzleFlashes) {
    for (const flash of muzzleFlashes) {
      const tf = frames[flash.frame]?.tanks.find(t => t.id === flash.tankId);
      if (!tf) continue;
      const center = cellCenter(tf.x, tf.y);
      const flashX = center.x + flash.dir.dx * (CELL_PITCH * 0.7);
      const flashY = center.y + flash.dir.dy * (CELL_PITCH * 0.7);
      const t0 = ft(flash.frame);
      const t1 = ft(Math.min(flash.frame + 2, totalFrames - 1));
      const t2 = ft(Math.min(flash.frame + 4, totalFrames - 1));
      svg += `  <circle cx="${flashX}" cy="${flashY}" r="0" fill="#fffbe6" opacity="0">\n`;
      svg += `    <animate attributeName="r" values="0;0;5;2" keyTimes="0;${t0};${t1};${t2}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `    <animate attributeName="opacity" values="0;0;0.9;0" keyTimes="0;${t0};${t1};${t2}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `  </circle>\n`;
    }
  }
  svg += `</g>\n`;

  // ── Bullets ──
  svg += `<g id="bullets">\n`;
  for (const bullet of allBullets) {
    if (bullet.path.length < 1) continue;
    const spawnFrame = bullet.spawnFrame;
    const deathFrame = bullet.deathFrame != null ? bullet.deathFrame : (spawnFrame + bullet.path.length);
    const ownerTank = tanks.find(t => t.id === bullet.ownerId);
    const bulletColor = ownerTank ? theme.tanks[ownerTank.color].body : theme.bullet;

    const posValues = [];
    const timeKeys = [];

    if (spawnFrame > 0) {
      const first = cellCenter(bullet.path[0].x, bullet.path[0].y);
      posValues.push(`${first.x},${first.y}`);
      timeKeys.push('0');
    }
    for (const p of bullet.path) {
      const c = cellCenter(p.x, p.y);
      posValues.push(`${c.x},${c.y}`);
      timeKeys.push(ft(p.frame));
    }
    const lastP = bullet.path[bullet.path.length - 1];
    const lastC = cellCenter(lastP.x, lastP.y);
    posValues.push(`${lastC.x},${lastC.y}`);
    timeKeys.push('1');

    const vPre = ft(Math.max(0, spawnFrame - 1));
    const vOn = ft(spawnFrame);
    const vOff = ft(deathFrame);
    const vGone = ft(Math.min(deathFrame + 1, totalFrames - 1));

    svg += `  <circle r="${BULLET_R + 1.5}" fill="${bulletColor}" opacity="0">\n`;
    svg += `    <animate attributeName="opacity" values="0;0;0.3;0.3;0;0" keyTimes="0;${vPre};${vOn};${vOff};${vGone};1" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    svg += `    <animateTransform attributeName="transform" type="translate" values="${posValues.join(';')}" keyTimes="${timeKeys.join(';')}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    svg += `  </circle>\n`;
    svg += `  <circle r="${BULLET_R}" fill="${bulletColor}" opacity="0">\n`;
    svg += `    <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${vPre};${vOn};${vOff};${vGone};1" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    svg += `    <animateTransform attributeName="transform" type="translate" values="${posValues.join(';')}" keyTimes="${timeKeys.join(';')}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    svg += `  </circle>\n`;
  }
  svg += `</g>\n`;

  // ── Tanks ──
  svg += `<g id="tanks">\n`;
  for (const tank of tanks) {
    const tankTheme = theme.tanks[tank.color];
    const anim = tankAnimationData(tank.id);
    const half = TANK_SIZE / 2;

    svg += `  <g opacity="1">\n`;

    svg += `    <animate attributeName="opacity" values="${anim.opValues}" keyTimes="${anim.opKeyTimes}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;

    if (anim.posCount > 1 && anim.posKeySplines) {
      svg += `    <animateTransform attributeName="transform" type="translate" values="${anim.posValues}" keyTimes="${anim.posKeyTimes}" calcMode="spline" keySplines="${anim.posKeySplines}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    } else {
      svg += `    <animateTransform attributeName="transform" type="translate" values="${anim.posValues}" keyTimes="${anim.posKeyTimes}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    }

    svg += `    <g>\n`;
    if (anim.rotCount > 1 && anim.rotKeySplines) {
      svg += `      <animateTransform attributeName="transform" type="rotate" values="${anim.rotValues}" keyTimes="${anim.rotKeyTimes}" calcMode="spline" keySplines="${anim.rotKeySplines}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    } else {
      svg += `      <animateTransform attributeName="transform" type="rotate" values="${anim.rotValues}" keyTimes="${anim.rotKeyTimes}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    }

    svg += `      <rect class="tank-body" x="${-half}" y="${-half}" width="${TANK_SIZE}" height="${TANK_SIZE}" rx="1.5" ry="1.5" fill="${tankTheme.body}" />\n`;
    svg += `      <rect x="${-half - 1}" y="${-half + 1}" width="2" height="${TANK_SIZE - 2}" rx="0.5" fill="${tankTheme.track}" />\n`;
    svg += `      <rect x="${half - 1}" y="${-half + 1}" width="2" height="${TANK_SIZE - 2}" rx="0.5" fill="${tankTheme.track}" />\n`;
    svg += `      <line class="turret" x1="0" y1="0" x2="${half + 3}" y2="0" stroke="${tankTheme.turret}" />\n`;
    svg += `      <circle cx="0" cy="0" r="2.5" fill="${tankTheme.turret}" />\n`;

    svg += `    </g>\n`;
    svg += `  </g>\n`;
  }
  svg += `</g>\n`;

  // ── Scoreboard ──
  const scoreY = GRID_TOP + rows * CELL_PITCH + 10;
  svg += `<g id="scoreboard">\n`;

  let scoreX = GRID_LEFT;

  for (const tank of tanks) {
    const tankTheme = theme.tanks[tank.color];
    const isWinner = winner && winner.id === tank.id;

    svg += `  <rect x="${scoreX}" y="${scoreY}" width="8" height="8" rx="1" fill="${tankTheme.body}" />\n`;

    if (isWinner) {
      svg += `  <text class="score-name" x="${scoreX + 11}" y="${scoreY + 7}" fill="${theme.text}">\u{1F3C6} ${tankTheme.label}</text>\n`;
    } else {
      svg += `  <text class="score-name" x="${scoreX + 11}" y="${scoreY + 7}" fill="${theme.text}">${tankTheme.label}</text>\n`;
    }

    svg += `  <text class="score-stat" x="${scoreX + 11}" y="${scoreY + 18}" fill="${theme.textMuted}">\u{1F4A5}${tank.kills}</text>\n`;

    if (tank.deathFrame != null) {
      const dtPre = ft(Math.max(0, tank.deathFrame - 1));
      const dtAt = ft(tank.deathFrame);
      svg += `  <text x="${scoreX - 1}" y="${scoreY + 9}" font-size="11" opacity="0">\n`;
      svg += `    <animate attributeName="opacity" values="0;0;1" keyTimes="0;${dtPre};${dtAt}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `    \u{1F480}\n`;
      svg += `  </text>\n`;
    }

    if (isWinner) {
      const deathFrames = tanks.filter(t => t.id !== tank.id && t.deathFrame != null).map(t => t.deathFrame);
      if (deathFrames.length > 0) {
        const lastDeath = Math.max(...deathFrames);
        const winPre = ft(Math.max(0, lastDeath - 1));
        const winAt = ft(lastDeath);
        svg += `  <text x="${scoreX}" y="${scoreY - 2}" font-size="10" opacity="0">\n`;
        svg += `    <animate attributeName="opacity" values="0;0;1" keyTimes="0;${winPre};${winAt}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
        svg += `    \u{1F451}\n`;
        svg += `  </text>\n`;
      }
    }

    scoreX += 90;
  }

  svg += `  <text class="sub-text" x="${svgWidth - 24}" y="${scoreY + 17}" text-anchor="end" fill="${theme.textMuted}">Kahooty/gitTanks</text>\n`;
  svg += `</g>\n`;

  svg += `<line x1="0" y1="${svgHeight - 1}" x2="${svgWidth}" y2="${svgHeight - 1}" stroke="${theme.gridBorder}" stroke-width="0.5" />\n`;
  svg += `</svg>\n`;

  return svg;
}

module.exports = { renderSVG };
