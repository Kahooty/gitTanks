/**
 * svg-renderer.js
 * Converts game recording → animated SVG with smooth SMIL animations.
 *
 * Key smoothness fixes:
 *   - Rotation: continuous angles that always take the shortest arc
 *   - Position: calcMode="spline" with ease curves for gliding
 *   - Bullets: clean spawn/despawn with tight opacity windows
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

function cellCenter(col, row) {
  return {
    x: GRID_LEFT + col * CELL_PITCH + CELL_SIZE / 2,
    y: GRID_TOP + row * CELL_PITCH + CELL_SIZE / 2,
  };
}

/**
 * Normalize angle delta to shortest arc (-180..180].
 * Returns the target angle adjusted to be within half-turn of current.
 */
function shortestArc(current, target) {
  let diff = target - current;
  while (diff > 180) diff -= 360;
  while (diff <= -180) diff += 360;
  return current + diff;
}

function renderSVG(gameResult, themeName = 'light') {
  const theme = themes[themeName] || themes.light;
  const { frames, allBullets, explosions, wallEvents, muzzleFlashes,
          tanks, grid, cols, rows, initialGrid } = gameResult;

  // Determine the winner (if any)
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
    const rawAngle = [];  // continuous (unwrapped) angles
    const rawOp = [];
    let died = false;
    let deathFrame = totalFrames;

    let runningAngle = null;  // accumulator for shortest-arc rotation

    for (let f = 0; f < totalFrames; f++) {
      const t = frames[f].tanks.find(t => t.id === tankId);
      if (!t) break;

      const c = cellCenter(t.x, t.y);
      rawPos.push({ x: c.x, y: c.y });

      // Continuous rotation: always take shortest arc
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

    // ── Position keyframes with spline easing ──
    const posKF = [];
    const posSplines = [];

    posKF.push({ pos: `${rawPos[0].x},${rawPos[0].y}`, time: ft(0) });

    for (let i = 1; i < rawPos.length; i++) {
      const moved = (rawPos[i].x !== rawPos[i - 1].x || rawPos[i].y !== rawPos[i - 1].y);
      if (moved) {
        // Anchor: hold previous position right before the move
        const anchorTime = ft(i - 1);
        if (posKF[posKF.length - 1].time !== anchorTime) {
          posKF.push({ pos: `${rawPos[i - 1].x},${rawPos[i - 1].y}`, time: anchorTime });
          posSplines.push(LINEAR);
        }
        // Glide to new position
        posKF.push({ pos: `${rawPos[i].x},${rawPos[i].y}`, time: ft(i) });
        posSplines.push(EASE);
      }
    }

    // Close out
    const lastPos = rawPos[rawPos.length - 1];
    const lastTime = ft(rawPos.length - 1);
    if (posKF[posKF.length - 1].time !== lastTime) {
      posKF.push({ pos: `${lastPos.x},${lastPos.y}`, time: lastTime });
      posSplines.push(LINEAR);
    }

    // ── Rotation keyframes (smooth short-arc turns) ──
    const rotKF = [];
    const rotSplines = [];

    rotKF.push({ val: rawAngle[0], time: ft(0) });

    for (let i = 1; i < rawAngle.length; i++) {
      if (rawAngle[i] !== rawAngle[i - 1]) {
        // Hold previous angle until 1 frame before the turn
        const holdTime = ft(i - 1);
        if (rotKF[rotKF.length - 1].time !== holdTime) {
          rotKF.push({ val: rawAngle[i - 1], time: holdTime });
          rotSplines.push(LINEAR);
        }
        // Smooth turn over 1 frame
        rotKF.push({ val: rawAngle[i], time: ft(i) });
        rotSplines.push(EASE);
      }
    }

    const lastRotTime = ft(rawAngle.length - 1);
    if (rotKF[rotKF.length - 1].time !== lastRotTime) {
      rotKF.push({ val: rawAngle[rawAngle.length - 1], time: lastRotTime });
      rotSplines.push(LINEAR);
    }

    // ── Opacity keyframes ──
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
  svg += `</style>\n`;

  // ── Background ──
  svg += `<rect class="bg" width="${svgWidth}" height="${svgHeight}" />\n`;

  // ── Grid: ground + walls ──
  svg += `<g id="grid">\n`;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = GRID_LEFT + c * CELL_PITCH;
      const y = GRID_TOP + r * CELL_PITCH;
      svg += `  <rect class="grid-cell" x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${theme.gridBackground}" />\n`;
    }
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const level = initialGrid[c][r].level;
      if (level === 0) continue;
      const x = GRID_LEFT + c * CELL_PITCH;
      const y = GRID_TOP + r * CELL_PITCH;
      const fill = theme.wallColors[level];
      const destruction = wallEvents.find(e => e.col === c && e.row === r);
      svg += `  <rect class="grid-cell" x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${fill}"`;
      if (destruction) {
        const preT = ft(Math.max(0, destruction.frame - 1));
        const destT = ft(destruction.frame);
        const fadeT = ft(Math.min(destruction.frame + 4, totalFrames - 1));
        svg += `>\n`;
        svg += `    <animate attributeName="opacity" values="1;1;0.3;0" keyTimes="0;${preT};${destT};${fadeT}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
        svg += `  </rect>\n`;
      } else {
        svg += ` />\n`;
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
    const maxR = isLarge ? 12 : 7;
    const color1 = isLarge ? '#ff4444' : theme.explosion;
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

  // ── Bullets: tight spawn/despawn opacity ──
  svg += `<g id="bullets">\n`;
  for (const bullet of allBullets) {
    if (bullet.path.length < 1) continue;
    const spawnFrame = bullet.spawnFrame;
    const deathFrame = bullet.deathFrame != null ? bullet.deathFrame : (spawnFrame + bullet.path.length);
    const ownerTank = tanks.find(t => t.id === bullet.ownerId);
    const bulletColor = ownerTank ? theme.tanks[ownerTank.color].body : theme.bullet;

    // Position keyframes
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

    // Opacity: visible ONLY during flight, hidden before and after
    const vPre = ft(Math.max(0, spawnFrame - 1));
    const vOn = ft(spawnFrame);
    const vOff = ft(deathFrame);
    const vGone = ft(Math.min(deathFrame + 1, totalFrames - 1));

    // Glow
    svg += `  <circle r="${BULLET_R + 1.5}" fill="${bulletColor}" opacity="0">\n`;
    svg += `    <animate attributeName="opacity" values="0;0;0.3;0.3;0;0" keyTimes="0;${vPre};${vOn};${vOff};${vGone};1" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    svg += `    <animateTransform attributeName="transform" type="translate" values="${posValues.join(';')}" keyTimes="${timeKeys.join(';')}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    svg += `  </circle>\n`;
    // Core
    svg += `  <circle r="${BULLET_R}" fill="${bulletColor}" opacity="0">\n`;
    svg += `    <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${vPre};${vOn};${vOff};${vGone};1" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    svg += `    <animateTransform attributeName="transform" type="translate" values="${posValues.join(';')}" keyTimes="${timeKeys.join(';')}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    svg += `  </circle>\n`;
  }
  svg += `</g>\n`;

  // ── Tanks (spline position + spline rotation for smooth turns) ──
  svg += `<g id="tanks">\n`;
  for (const tank of tanks) {
    const tankTheme = theme.tanks[tank.color];
    const anim = tankAnimationData(tank.id);
    const half = TANK_SIZE / 2;

    svg += `  <g opacity="1">\n`;

    // Opacity
    svg += `    <animate attributeName="opacity" values="${anim.opValues}" keyTimes="${anim.opKeyTimes}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;

    // Position (spline-eased gliding)
    if (anim.posCount > 1 && anim.posKeySplines) {
      svg += `    <animateTransform attributeName="transform" type="translate" values="${anim.posValues}" keyTimes="${anim.posKeyTimes}" calcMode="spline" keySplines="${anim.posKeySplines}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    } else {
      svg += `    <animateTransform attributeName="transform" type="translate" values="${anim.posValues}" keyTimes="${anim.posKeyTimes}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    }

    // Inner group for rotation (spline-eased smooth turning)
    svg += `    <g>\n`;
    if (anim.rotCount > 1 && anim.rotKeySplines) {
      svg += `      <animateTransform attributeName="transform" type="rotate" values="${anim.rotValues}" keyTimes="${anim.rotKeyTimes}" calcMode="spline" keySplines="${anim.rotKeySplines}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    } else {
      svg += `      <animateTransform attributeName="transform" type="rotate" values="${anim.rotValues}" keyTimes="${anim.rotKeyTimes}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
    }

    // Tank body
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
  // Layout: [color-dot] Name  💥N  [💀 on death | 🏆 on win]
  const scoreY = GRID_TOP + rows * CELL_PITCH + 10;
  svg += `<g id="scoreboard">\n`;

  let scoreX = GRID_LEFT;

  for (const tank of tanks) {
    const tankTheme = theme.tanks[tank.color];
    const isWinner = winner && winner.id === tank.id;

    // Color dot
    svg += `  <rect x="${scoreX}" y="${scoreY}" width="8" height="8" rx="1" fill="${tankTheme.body}" />\n`;

    // Tank name (winner gets trophy prefix)
    if (isWinner) {
      svg += `  <text class="score-name" x="${scoreX + 11}" y="${scoreY + 7}" fill="${theme.text}">\u{1F3C6} ${tankTheme.label}</text>\n`;
    } else {
      svg += `  <text class="score-name" x="${scoreX + 11}" y="${scoreY + 7}" fill="${theme.text}">${tankTheme.label}</text>\n`;
    }

    // Kill count (static final)
    svg += `  <text class="score-stat" x="${scoreX + 11}" y="${scoreY + 18}" fill="${theme.textMuted}">\u{1F4A5}${tank.kills}</text>\n`;

    // 💀 on death (animated: appears at deathFrame)
    if (tank.deathFrame != null) {
      const dtPre = ft(Math.max(0, tank.deathFrame - 1));
      const dtAt = ft(tank.deathFrame);
      svg += `  <text x="${scoreX - 1}" y="${scoreY + 9}" font-size="11" opacity="0">\n`;
      svg += `    <animate attributeName="opacity" values="0;0;1" keyTimes="0;${dtPre};${dtAt}" dur="${dur}" fill="freeze" repeatCount="indefinite" />\n`;
      svg += `    \u{1F480}\n`;
      svg += `  </text>\n`;
    }

    // 👑 crown above winner (animated: appears when last rival dies)
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

  // Attribution
  svg += `  <text class="sub-text" x="${svgWidth - 24}" y="${scoreY + 17}" text-anchor="end" fill="${theme.textMuted}">Kahooty/gitTanks</text>\n`;
  svg += `</g>\n`;

  svg += `<line x1="0" y1="${svgHeight - 1}" x2="${svgWidth}" y2="${svgHeight - 1}" stroke="${theme.gridBorder}" stroke-width="0.5" />\n`;
  svg += `</svg>\n`;

  return svg;
}

module.exports = { renderSVG };
