/**
 * game-engine.js
 * Tank Battle game simulation on the contribution grid.
 *
 * Walls are edge-based: thin maze walls drawn in the gaps between cells.
 * Activity nodes serve as background only (no gameplay impact).
 * The maze is generated randomly each game (seeded) via DFS + extra openings.
 */

const DIRECTIONS = {
  UP:    { dx: 0, dy: -1, angle: 270, name: 'UP' },
  DOWN:  { dx: 0, dy:  1, angle: 90,  name: 'DOWN' },
  LEFT:  { dx: -1, dy: 0, angle: 180, name: 'LEFT' },
  RIGHT: { dx: 1, dy:  0, angle: 0,   name: 'RIGHT' },
};
const DIR_LIST = [DIRECTIONS.UP, DIRECTIONS.DOWN, DIRECTIONS.LEFT, DIRECTIONS.RIGHT];

class RNG {
  constructor(seed = 12345) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  nextInt(max) { return Math.floor(this.next() * max); }
  pick(arr) { return arr[this.nextInt(arr.length)]; }
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

const EXTRA_WALL_REMOVAL_RATE = 0.40;

/**
 * Generate a maze on the grid using edge walls (walls between cells).
 *
 * hWalls[c][r] = true → wall between cell (c,r) and (c,r+1)
 * vWalls[c][r] = true → wall between cell (c,r) and (c+1,r)
 *
 * Algorithm:
 *  1. Start with all internal walls present
 *  2. Randomized DFS (recursive backtracker) to carve a spanning tree
 *  3. Remove additional walls (~30%) to create loops and wider passages
 *  4. Clear walls around the four spawn corners
 */
function generateMaze(cols, rows, rng) {
  // hWalls: cols × (rows-1)
  const hWalls = [];
  for (let c = 0; c < cols; c++) {
    hWalls[c] = [];
    for (let r = 0; r < rows - 1; r++) {
      hWalls[c][r] = true;
    }
  }
  // vWalls: (cols-1) × rows
  const vWalls = [];
  for (let c = 0; c < cols - 1; c++) {
    vWalls[c] = [];
    for (let r = 0; r < rows; r++) {
      vWalls[c][r] = true;
    }
  }

  // DFS maze generation (recursive backtracker)
  const visited = [];
  for (let c = 0; c < cols; c++) {
    visited[c] = [];
    for (let r = 0; r < rows; r++) {
      visited[c][r] = false;
    }
  }

  const stack = [];
  const startC = rng.nextInt(cols);
  const startR = rng.nextInt(rows);
  visited[startC][startR] = true;
  stack.push({ c: startC, r: startR });

  while (stack.length > 0) {
    const { c, r } = stack[stack.length - 1];
    const neighbors = [];
    if (r > 0 && !visited[c][r - 1])       neighbors.push({ c, r: r - 1, wType: 'h', wc: c, wr: r - 1 });
    if (r < rows - 1 && !visited[c][r + 1]) neighbors.push({ c, r: r + 1, wType: 'h', wc: c, wr: r });
    if (c > 0 && !visited[c - 1][r])       neighbors.push({ c: c - 1, r, wType: 'v', wc: c - 1, wr: r });
    if (c < cols - 1 && !visited[c + 1][r]) neighbors.push({ c: c + 1, r, wType: 'v', wc: c, wr: r });

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = rng.pick(neighbors);
    if (next.wType === 'h') hWalls[next.wc][next.wr] = false;
    else vWalls[next.wc][next.wr] = false;
    visited[next.c][next.r] = true;
    stack.push({ c: next.c, r: next.r });
  }

  // Remove extra walls to create loops and wider corridors for gameplay
  const remaining = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 1; r++) {
      if (hWalls[c][r]) remaining.push({ type: 'h', c, r });
    }
  }
  for (let c = 0; c < cols - 1; c++) {
    for (let r = 0; r < rows; r++) {
      if (vWalls[c][r]) remaining.push({ type: 'v', c, r });
    }
  }

  const toRemove = Math.floor(remaining.length * EXTRA_WALL_REMOVAL_RATE);
  const shuffled = rng.shuffle(remaining);
  for (let i = 0; i < toRemove; i++) {
    const w = shuffled[i];
    if (w.type === 'h') hWalls[w.c][w.r] = false;
    else vWalls[w.c][w.r] = false;
  }

  // ── Structured corridors and arenas for better gameplay layout ──

  // Horizontal lanes: clear vertical walls along key rows so tanks can traverse
  const hCorridorRows = [1, Math.floor(rows / 2)];
  if (rows > 5) hCorridorRows.push(rows - 2);

  for (const cr of hCorridorRows) {
    for (let c = 0; c < cols - 1; c++) {
      if (rng.next() < 0.7) vWalls[c][cr] = false;
    }
  }

  // Vertical connectors: clear horizontal walls at regular intervals for lane-switching
  const vSpacing = Math.max(8, Math.floor(cols / 5));
  for (let i = 1; i * vSpacing < cols; i++) {
    const vc = i * vSpacing;
    if (vc < cols) {
      for (let r = 0; r < rows - 1; r++) {
        if (rng.next() < 0.8) hWalls[vc][r] = false;
      }
    }
  }

  // Open areas at corridor intersections for combat arenas
  for (let i = 1; i * vSpacing < cols; i++) {
    const vc = i * vSpacing;
    for (const cr of hCorridorRows) {
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const c = vc + dc;
          const r = cr + dr;
          if (c >= 0 && c < cols && r >= 0 && r < rows - 1) hWalls[c][r] = false;
          if (c >= 0 && c < cols - 1 && r >= 0 && r < rows) vWalls[c][r] = false;
        }
      }
    }
  }

  // Center arena: larger open area at the map center
  const centerC = Math.floor(cols / 2);
  const centerR = Math.floor(rows / 2);
  for (let dc = -2; dc <= 2; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const c = centerC + dc;
      const r = centerR + dr;
      if (c >= 0 && c < cols && r >= 0 && r < rows - 1) hWalls[c][r] = false;
      if (c >= 0 && c < cols - 1 && r >= 0 && r < rows) vWalls[c][r] = false;
    }
  }

  return { hWalls, vWalls };
}

function simulateGame(grid, options = {}) {
  const {
    maxFrames = 600,
    shootCooldown = 12,
    moveCooldownAfterMove = 2,
    moveCooldownAfterShot = 4,
    bulletSpeed = 1,
    seed = 42,
    numRounds = 3,
    transitionFrames = 12,
  } = options;

  const rng = new RNG(seed);
  const cols = grid.length;
  const rows = grid[0] ? grid[0].length : 7;

  // Generate edge-based maze
  const { hWalls, vWalls } = generateMaze(cols, rows, rng);

  // Clear walls around spawn corners (radius in cells)
  function clearSpawnArea(cx, cy, radius) {
    const minC = Math.max(0, cx - radius);
    const maxC = Math.min(cols - 1, cx + radius);
    const minR = Math.max(0, cy - radius);
    const maxR = Math.min(rows - 1, cy + radius);
    for (let c = minC; c <= maxC; c++) {
      for (let r = minR; r < maxR; r++) {
        hWalls[c][r] = false;
      }
    }
    for (let c = minC; c < maxC; c++) {
      for (let r = minR; r <= maxR; r++) {
        vWalls[c][r] = false;
      }
    }
  }

  function clearSpawnsAndAddBarriers() {
    clearSpawnArea(2, 0, 2);
    clearSpawnArea(cols - 3, 0, 2);
    clearSpawnArea(1, rows - 1, 2);
    clearSpawnArea(cols - 2, rows - 1, 2);

    const midRow = Math.floor(rows / 2);
    for (let c = 0; c < 5 && c < cols; c++) {
      if (midRow > 0 && midRow < rows) hWalls[c][midRow - 1] = true;
      if (midRow < rows - 1)           hWalls[c][midRow] = true;
    }
    for (let c = Math.max(0, cols - 5); c < cols; c++) {
      if (midRow > 0 && midRow < rows) hWalls[c][midRow - 1] = true;
      if (midRow < rows - 1)           hWalls[c][midRow] = true;
    }
  }

  clearSpawnsAndAddBarriers();

  // Snapshot the initial maze state for rendering (before bullets destroy walls)
  let initialHWalls = hWalls.map(col => [...col]);
  let initialVWalls = vWalls.map(col => [...col]);

  // ── Edge-wall helpers ─────────────────────────────────────────────

  function hasWallBetween(x1, y1, x2, y2) {
    if (x2 === x1 + 1 && y2 === y1) return x1 < cols - 1 && vWalls[x1][y1];
    if (x2 === x1 - 1 && y2 === y1) return x2 >= 0 && x2 < cols - 1 && vWalls[x2][y1];
    if (y2 === y1 + 1 && x2 === x1) return y1 < rows - 1 && hWalls[x1][y1];
    if (y2 === y1 - 1 && x2 === x1) return y2 >= 0 && y2 < rows - 1 && hWalls[x1][y2];
    return true;
  }

  function canMove(x, y, dir) {
    const nx = x + dir.dx, ny = y + dir.dy;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return false;
    return !hasWallBetween(x, y, nx, ny);
  }

  function wallInDir(x, y, dir) {
    const nx = x + dir.dx, ny = y + dir.dy;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return null;
    if (!hasWallBetween(x, y, nx, ny)) return null;
    // Return the wall identity for destruction
    if (dir === DIRECTIONS.RIGHT) return { type: 'v', c: x, r: y };
    if (dir === DIRECTIONS.LEFT)  return { type: 'v', c: x - 1, r: y };
    if (dir === DIRECTIONS.DOWN)  return { type: 'h', c: x, r: y };
    if (dir === DIRECTIONS.UP)    return { type: 'h', c: x, r: y - 1 };
    return null;
  }

  function destroyWall(wallId) {
    if (wallId.type === 'h') hWalls[wallId.c][wallId.r] = false;
    else vWalls[wallId.c][wallId.r] = false;
  }

  function tankAt(c, r, excludeId) {
    return tanks.find(t => t.alive && t.id !== excludeId && t.x === c && t.y === r);
  }

  function hasLineOfSight(x1, y1, x2, y2) {
    if (x1 === x2) {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      for (let y = minY; y < maxY; y++) {
        if (hWalls[x1][y]) return false;
      }
      return true;
    }
    if (y1 === y2) {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      for (let x = minX; x < maxX; x++) {
        if (vWalls[x][y1]) return false;
      }
      return true;
    }
    return false;
  }

  function bfsNextStep(fromX, fromY, toX, toY, tankId) {
    if (fromX === toX && fromY === toY) return null;
    const visited = new Set([`${fromX},${fromY}`]);
    const queue = [{ x: fromX, y: fromY, firstDir: null }];
    let itr = 0;
    while (queue.length > 0 && itr < 1200) {
      itr++;
      const cur = queue.shift();
      for (const dir of DIR_LIST) {
        const nx = cur.x + dir.dx, ny = cur.y + dir.dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (hasWallBetween(cur.x, cur.y, nx, ny)) continue;
        if (tankAt(nx, ny, tankId)) continue;
        visited.add(key);
        const fd = cur.firstDir || dir;
        if (nx === toX && ny === toY) return fd;
        queue.push({ x: nx, y: ny, firstDir: fd });
      }
    }
    return null;
  }

  // BFS to find a firing position with line-of-sight to the target, preferring optimal range
  function bfsToFiringPosition(fromX, fromY, targetX, targetY, tankId) {
    // If already have LOS and at good range (3+), stay put
    const currentDist = Math.abs(fromX - targetX) + Math.abs(fromY - targetY);
    if ((fromX === targetX || fromY === targetY) &&
        hasLineOfSight(fromX, fromY, targetX, targetY) && currentDist >= 3) return null;

    const visited = new Set([`${fromX},${fromY}`]);
    const queue = [{ x: fromX, y: fromY, firstDir: null }];
    const candidates = [];
    let itr = 0;
    while (queue.length > 0 && itr < 1200) {
      itr++;
      const cur = queue.shift();
      for (const dir of DIR_LIST) {
        const nx = cur.x + dir.dx, ny = cur.y + dir.dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (hasWallBetween(cur.x, cur.y, nx, ny)) continue;
        if (tankAt(nx, ny, tankId)) continue;
        visited.add(key);
        const fd = cur.firstDir || dir;
        if ((nx === targetX || ny === targetY) &&
            hasLineOfSight(nx, ny, targetX, targetY)) {
          const dist = Math.abs(nx - targetX) + Math.abs(ny - targetY);
          candidates.push({ dir: fd, dist });
          if (candidates.length >= 6) break;
        }
        queue.push({ x: nx, y: ny, firstDir: fd });
      }
      if (candidates.length >= 6) break;
    }

    if (candidates.length === 0) return null;
    // Prefer candidates at optimal range (3-8)
    candidates.sort((a, b) => {
      const aScore = a.dist >= 3 && a.dist <= 8 ? 0 : Math.abs(a.dist - 5);
      const bScore = b.dist >= 3 && b.dist <= 8 ? 0 : Math.abs(b.dist - 5);
      return aScore - bScore;
    });
    return candidates[0].dir;
  }

  // Check if any enemy bullet is heading toward the tank
  function getBulletThreats(tank) {
    const threats = [];
    for (const bullet of bullets) {
      if (!bullet.alive || bullet.ownerId === tank.id) continue;
      const { dx, dy } = bullet.dir;
      if (dx !== 0 && dy === 0 && bullet.y === tank.y) {
        if ((dx > 0 && bullet.x < tank.x) || (dx < 0 && bullet.x > tank.x)) {
          if (hasLineOfSight(bullet.x, bullet.y, tank.x, tank.y)) {
            threats.push(bullet);
          }
        }
      } else if (dy !== 0 && dx === 0 && bullet.x === tank.x) {
        if ((dy > 0 && bullet.y < tank.y) || (dy < 0 && bullet.y > tank.y)) {
          if (hasLineOfSight(bullet.x, bullet.y, tank.x, tank.y)) {
            threats.push(bullet);
          }
        }
      }
    }
    return threats;
  }

  // Find a safe direction to dodge incoming bullets
  function findEvasionMove(tank, threats) {
    if (threats.length === 0) return null;
    const threat = threats[0];
    const perpDirs = [];
    if (threat.dir.dx !== 0) {
      perpDirs.push(DIRECTIONS.UP, DIRECTIONS.DOWN);
    } else {
      perpDirs.push(DIRECTIONS.LEFT, DIRECTIONS.RIGHT);
    }
    const shuffled = rng.shuffle(perpDirs);
    for (const dir of shuffled) {
      if (canMove(tank.x, tank.y, dir) && !tankAt(tank.x + dir.dx, tank.y + dir.dy, tank.id)) {
        return dir;
      }
    }
    return null;
  }

  // ── Tanks ─────────────────────────────────────────────────────────

  const tanks = [
    { id: 0, name: 'Alpha',   color: 'tank-green',  x: 2, y: 0,             dir: DIRECTIONS.RIGHT, alive: true, shootCD: 6, moveCD: 0, kills: 0, clearDir: null },
    { id: 1, name: 'Bravo',   color: 'tank-blue',   x: cols - 3, y: 0,      dir: DIRECTIONS.LEFT,  alive: true, shootCD: 8, moveCD: 0, kills: 0, clearDir: null },
    { id: 2, name: 'Charlie', color: 'tank-red',    x: 1, y: rows - 1,      dir: DIRECTIONS.RIGHT, alive: true, shootCD: 7, moveCD: 0, kills: 0, clearDir: null },
    { id: 3, name: 'Delta',   color: 'tank-orange', x: cols - 2, y: rows - 1, dir: DIRECTIONS.LEFT,  alive: true, shootCD: 10, moveCD: 0, kills: 0, clearDir: null },
  ];

  const bullets = [];
  let bulletIdCounter = 0;
  const allBullets = [];
  const explosions = [];
  const wallEvents = [];
  const muzzleFlashes = [];
  const killEvents = [];
  const frames = [];

  function nearestEnemy(tank) {
    let best = null, bestDist = Infinity;
    for (const other of tanks) {
      if (other.id === tank.id || !other.alive) continue;
      const dist = Math.abs(other.x - tank.x) + Math.abs(other.y - tank.y);
      if (dist < bestDist) { bestDist = dist; best = other; }
    }
    return best;
  }

  function findShootTarget(tank) {
    for (const other of tanks) {
      if (other.id === tank.id || !other.alive) continue;
      if ((tank.x === other.x || tank.y === other.y) &&
          hasLineOfSight(tank.x, tank.y, other.x, other.y)) {
        return other;
      }
    }
    return null;
  }

  function fireBullet(tank, dir, frameIndex) {
    tank.dir = dir;
    tank.shootCD = shootCooldown;
    tank.moveCD = moveCooldownAfterShot;
    muzzleFlashes.push({ tankId: tank.id, frame: frameIndex, dir });
    const bullet = {
      id: bulletIdCounter++,
      ownerId: tank.id,
      x: tank.x,
      y: tank.y,
      dir,
      spawnFrame: frameIndex,
      alive: true,
      path: [{ x: tank.x, y: tank.y, frame: frameIndex }]
    };
    bullets.push(bullet);
    allBullets.push(bullet);
  }

  function tankAction(tank, frameIndex) {
    if (!tank.alive) return;
    if (tank.shootCD > 0) tank.shootCD--;
    if (tank.moveCD > 0) tank.moveCD--;

    const enemy = nearestEnemy(tank);
    if (!enemy) return;

    // Priority 1: Shoot enemy in line of sight
    const target = findShootTarget(tank);
    if (target && tank.shootCD <= 0) {
      const dx = target.x - tank.x;
      const dy = target.y - tank.y;
      let dir;
      if (dx === 0) dir = dy < 0 ? DIRECTIONS.UP : DIRECTIONS.DOWN;
      else dir = dx < 0 ? DIRECTIONS.LEFT : DIRECTIONS.RIGHT;
      fireBullet(tank, dir, frameIndex);
      return;
    }

    // Priority 1.5: Retreat if too close to enemy and can't shoot
    if (tank.moveCD <= 0) {
      const distToEnemy = Math.abs(enemy.x - tank.x) + Math.abs(enemy.y - tank.y);
      if (distToEnemy <= 2 && tank.shootCD > 0) {
        const retreatDirs = DIR_LIST.filter(d => {
          if (!canMove(tank.x, tank.y, d)) return false;
          const nx = tank.x + d.dx, ny = tank.y + d.dy;
          if (tankAt(nx, ny, tank.id)) return false;
          const newDist = Math.abs(nx - enemy.x) + Math.abs(ny - enemy.y);
          return newDist > distToEnemy;
        });
        if (retreatDirs.length > 0) {
          const moveDir = rng.pick(retreatDirs);
          tank.x += moveDir.dx;
          tank.y += moveDir.dy;
          tank.dir = moveDir;
          tank.moveCD = moveCooldownAfterMove;
          return;
        }
      }
    }

    // Priority 2: Evade incoming bullets
    const threats = getBulletThreats(tank);
    if (threats.length > 0 && tank.moveCD <= 0) {
      const evadeDir = findEvasionMove(tank, threats);
      if (evadeDir) {
        const nx = tank.x + evadeDir.dx, ny = tank.y + evadeDir.dy;
        tank.x = nx;
        tank.y = ny;
        tank.dir = evadeDir;
        tank.moveCD = moveCooldownAfterMove;
        return;
      }
    }

    // Priority 2.5: Strafe after shooting if enemy is close
    if (tank.moveCD <= 0 && tank.shootCD > shootCooldown - 3) {
      const distToEnemy = Math.abs(enemy.x - tank.x) + Math.abs(enemy.y - tank.y);
      if (distToEnemy <= 4) {
        const perpDirs = [];
        if (tank.dir.dx !== 0) perpDirs.push(DIRECTIONS.UP, DIRECTIONS.DOWN);
        else perpDirs.push(DIRECTIONS.LEFT, DIRECTIONS.RIGHT);
        const strafeDirs = rng.shuffle(perpDirs).filter(d => {
          return canMove(tank.x, tank.y, d) && !tankAt(tank.x + d.dx, tank.y + d.dy, tank.id);
        });
        if (strafeDirs.length > 0) {
          const moveDir = strafeDirs[0];
          tank.x += moveDir.dx;
          tank.y += moveDir.dy;
          tank.dir = moveDir;
          tank.moveCD = moveCooldownAfterMove;
          return;
        }
      }
    }

    // Priority 2.7: Follow through after wall clearing - advance through destroyed wall
    if (tank.moveCD <= 0 && tank.clearDir) {
      const cd = tank.clearDir;
      if (canMove(tank.x, tank.y, cd) && !tankAt(tank.x + cd.dx, tank.y + cd.dy, tank.id)) {
        tank.x += cd.dx;
        tank.y += cd.dy;
        tank.dir = cd;
        tank.moveCD = moveCooldownAfterMove;
        if (!wallInDir(tank.x, tank.y, cd)) tank.clearDir = null;
        return;
      }
      tank.clearDir = null;
    }

    // Priority 3: Shoot wall on cardinal line to enemy to create line of sight
    if (tank.shootCD <= 0) {
      const edx = enemy.x - tank.x;
      const edy = enemy.y - tank.y;
      let cardinalDir = null;
      if (edx === 0 && edy !== 0) cardinalDir = edy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP;
      else if (edy === 0 && edx !== 0) cardinalDir = edx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;

      if (cardinalDir) {
        const w = wallInDir(tank.x, tank.y, cardinalDir);
        if (w) {
          tank.clearDir = cardinalDir;
          fireBullet(tank, cardinalDir, frameIndex);
          return;
        }
      }
    }

    // Priority 4: Move to a firing position (line of sight to enemy)
    if (tank.moveCD <= 0) {
      let moveDir = bfsToFiringPosition(tank.x, tank.y, enemy.x, enemy.y, tank.id);

      if (moveDir) {
        const nx = tank.x + moveDir.dx, ny = tank.y + moveDir.dy;
        if (canMove(tank.x, tank.y, moveDir) && !tankAt(nx, ny, tank.id)) {
          tank.x = nx;
          tank.y = ny;
          tank.dir = moveDir;
          tank.moveCD = moveCooldownAfterMove;
          return;
        }
      }
    }

    // Priority 5: Shoot wall toward enemy if no firing position reachable
    if (tank.shootCD <= 0) {
      const edx = enemy.x - tank.x;
      const edy = enemy.y - tank.y;
      let primaryDirs = [];
      if (Math.abs(edx) >= Math.abs(edy)) {
        if (edx !== 0) primaryDirs.push(edx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT);
        if (edy !== 0) primaryDirs.push(edy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP);
      } else {
        if (edy !== 0) primaryDirs.push(edy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP);
        if (edx !== 0) primaryDirs.push(edx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT);
      }
      for (const dir of [...primaryDirs, ...DIR_LIST]) {
        const w = wallInDir(tank.x, tank.y, dir);
        if (w) {
          tank.clearDir = dir;
          fireBullet(tank, dir, frameIndex);
          return;
        }
      }
    }

    // Priority 6: Random walk
    if (tank.moveCD <= 0) {
      const openDirs = DIR_LIST.filter(d => {
        return canMove(tank.x, tank.y, d) && !tankAt(tank.x + d.dx, tank.y + d.dy, tank.id);
      });
      if (openDirs.length > 0) {
        const moveDir = rng.pick(openDirs);
        const nx = tank.x + moveDir.dx, ny = tank.y + moveDir.dy;
        tank.x = nx;
        tank.y = ny;
        tank.dir = moveDir;
        tank.moveCD = moveCooldownAfterMove;
      }
    }
  }

  function updateBullets(frameIndex) {
    for (const bullet of bullets) {
      if (!bullet.alive) continue;

      for (let step = 0; step < bulletSpeed; step++) {
        const nx = bullet.x + bullet.dir.dx;
        const ny = bullet.y + bullet.dir.dy;

        // DESPAWN: out of bounds (boundary wall)
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
          bullet.alive = false;
          bullet.deathFrame = frameIndex;
          break;
        }

        // DESPAWN: hit edge wall → destroy wall instantly
        const w = wallInDir(bullet.x, bullet.y, bullet.dir);
        if (w) {
          destroyWall(w);
          wallEvents.push({ type: w.type, col: w.c, row: w.r, frame: frameIndex });
          explosions.push({ x: bullet.x, y: bullet.y, frame: frameIndex, type: 'wall', wallDir: bullet.dir });
          bullet.alive = false;
          bullet.deathFrame = frameIndex;
          break;
        }

        // DESPAWN: hit tank → destroy tank
        const hitTank = tankAt(nx, ny, bullet.ownerId);
        if (hitTank) {
          hitTank.alive = false;
          hitTank.deathFrame = frameIndex;
          const shooter = tanks.find(t => t.id === bullet.ownerId);
          if (shooter) shooter.kills++;
          killEvents.push({ killerId: bullet.ownerId, victimId: hitTank.id, frame: frameIndex });
          explosions.push({ x: nx, y: ny, frame: frameIndex, type: 'tank' });
          bullet.alive = false;
          bullet.deathFrame = frameIndex;
          break;
        }

        // Move bullet forward
        bullet.x = nx;
        bullet.y = ny;
        bullet.path.push({ x: nx, y: ny, frame: frameIndex });
      }
    }

    // Purge dead bullets from active list
    for (let i = bullets.length - 1; i >= 0; i--) {
      if (!bullets[i].alive) bullets.splice(i, 1);
    }
  }

  // === MULTI-ROUND GAME LOOP ===
  const framesPerRound = Math.floor((maxFrames - transitionFrames * (numRounds - 1)) / numRounds);
  const rounds = [];
  let currentFrame = 0;

  // Tank starting positions for reset
  const tankStartPositions = [
    { x: 2, y: 0, dir: DIRECTIONS.RIGHT, shootCD: 6 },
    { x: cols - 3, y: 0, dir: DIRECTIONS.LEFT, shootCD: 8 },
    { x: 1, y: rows - 1, dir: DIRECTIONS.RIGHT, shootCD: 7 },
    { x: cols - 2, y: rows - 1, dir: DIRECTIONS.LEFT, shootCD: 10 },
  ];

  // Store first round maze for backward compat
  const firstRoundInitialHWalls = initialHWalls.map(col => [...col]);
  const firstRoundInitialVWalls = initialVWalls.map(col => [...col]);

  for (let round = 0; round < numRounds; round++) {
    // Between rounds: regenerate maze and reset state
    if (round > 0) {
      // Add transition frames (dead time for visual pause)
      for (let t = 0; t < transitionFrames; t++) {
        frames.push({
          frame: currentFrame,
          tanks: tanks.map(t => ({
            id: t.id, x: t.x, y: t.y, dir: t.dir,
            alive: t.alive, color: t.color, name: t.name, kills: t.kills,
          })),
          bullets: [],
          transition: true,
        });
        currentFrame++;
      }

      // Regenerate maze (rng continues deterministically)
      const newMaze = generateMaze(cols, rows, rng);

      // Mutate hWalls in-place: clear then copy
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows - 1; r++) {
          hWalls[c][r] = newMaze.hWalls[c][r];
        }
      }
      for (let c = 0; c < cols - 1; c++) {
        for (let r = 0; r < rows; r++) {
          vWalls[c][r] = newMaze.vWalls[c][r];
        }
      }

      // Re-clear spawn areas and add barriers
      clearSpawnsAndAddBarriers();

      // Update initial maze snapshots for this round
      initialHWalls = hWalls.map(col => [...col]);
      initialVWalls = vWalls.map(col => [...col]);

      // Reset tanks to starting positions
      for (let i = 0; i < tanks.length; i++) {
        tanks[i].x = tankStartPositions[i].x;
        tanks[i].y = tankStartPositions[i].y;
        tanks[i].dir = tankStartPositions[i].dir;
        tanks[i].alive = true;
        tanks[i].shootCD = tankStartPositions[i].shootCD;
        tanks[i].moveCD = 0;
        tanks[i].deathFrame = undefined;
        tanks[i].clearDir = null;
      }

      // Clear active bullets
      bullets.length = 0;
    }

    const roundStartFrame = currentFrame;
    const roundWallEventsStart = wallEvents.length;

    // Snapshot maze state at the start of this round
    const roundInitialHWalls = hWalls.map(col => [...col]);
    const roundInitialVWalls = vWalls.map(col => [...col]);

    // Round game loop
    const roundEndFrame = currentFrame + framesPerRound;
    for (; currentFrame < roundEndFrame; currentFrame++) {
      frames.push({
        frame: currentFrame,
        tanks: tanks.map(t => ({
          id: t.id, x: t.x, y: t.y, dir: t.dir,
          alive: t.alive, color: t.color, name: t.name, kills: t.kills,
        })),
        bullets: bullets.map(b => ({
          id: b.id, x: b.x, y: b.y, alive: b.alive, ownerId: b.ownerId,
        })),
      });

      const aliveTanks = tanks.filter(t => t.alive);
      if (aliveTanks.length <= 1) {
        for (let extra = 0; extra < 8; extra++) {
          frames.push({
            frame: currentFrame + extra + 1,
            tanks: tanks.map(t => ({
              id: t.id, x: t.x, y: t.y, dir: t.dir,
              alive: t.alive, color: t.color, name: t.name, kills: t.kills,
            })),
            bullets: [],
          });
        }
        currentFrame += 9;
        break;
      }

      const order = rng.shuffle([0, 1, 2, 3]);
      for (const idx of order) tankAction(tanks[idx], currentFrame);
      updateBullets(currentFrame);
    }

    const aliveFinalRound = tanks.filter(t => t.alive);
    const roundWinner = aliveFinalRound.length === 1 ? aliveFinalRound[0] : null;

    rounds.push({
      startFrame: roundStartFrame,
      endFrame: currentFrame,
      maze: {
        initialHWalls: roundInitialHWalls,
        initialVWalls: roundInitialVWalls,
      },
      wallEvents: wallEvents.slice(roundWallEventsStart),
      winner: roundWinner,
    });
  }

  const initialGrid = grid.map(col => col.map(cell => ({ ...cell })));
  const aliveFinal = tanks.filter(t => t.alive);
  const winner = aliveFinal.length === 1 ? aliveFinal[0] : null;

  // Count maze walls for stats (first round)
  let mazeWallCount = 0;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows - 1; r++) if (firstRoundInitialHWalls[c][r]) mazeWallCount++;
  for (let c = 0; c < cols - 1; c++) for (let r = 0; r < rows; r++) if (firstRoundInitialVWalls[c][r]) mazeWallCount++;

  return {
    frames, allBullets, explosions, wallEvents, muzzleFlashes, killEvents,
    tanks, winner, grid, cols, rows, initialGrid,
    maze: { hWalls, vWalls, initialHWalls: firstRoundInitialHWalls, initialVWalls: firstRoundInitialVWalls },
    mazeWallCount,
    rounds,
  };
}

module.exports = { simulateGame, DIRECTIONS };
