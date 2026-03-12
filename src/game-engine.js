/**
 * game-engine.js
 * Tank Battle game simulation on the contribution grid
 *
 * Activity blocks (contribution cells with level > 0) are walls.
 * Walls are always destroyed in a single shot.
 * Tanks must shoot to clear a blocked path.
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

function simulateGame(grid, options = {}) {
  const {
    maxFrames = 600,
    shootCooldown = 12,
    moveCooldownAfterMove = 2,
    moveCooldownAfterShot = 4,
    bulletSpeed = 1,
    seed = 42,
  } = options;

  const rng = new RNG(seed);
  const cols = grid.length;
  const rows = grid[0] ? grid[0].length : 7;

  // Wall map: true = wall exists, false = open ground
  // Activity blocks (level > 0) ARE walls. One shot destroys them.
  const wallMap = [];
  for (let c = 0; c < cols; c++) {
    wallMap[c] = [];
    for (let r = 0; r < rows; r++) {
      wallMap[c][r] = grid[c][r].level > 0;
    }
  }

  function clearArea(cx, cy, radius) {
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const c = cx + dc, r = cy + dr;
        if (c >= 0 && c < cols && r >= 0 && r < rows) wallMap[c][r] = false;
      }
    }
  }
  clearArea(2, 0, 2);
  clearArea(cols - 3, 0, 2);
  clearArea(1, rows - 1, 2);
  clearArea(cols - 2, rows - 1, 2);

  // Barriers between vertical spawn pairs
  const midRow = Math.floor(rows / 2);
  for (let c = 0; c < 5; c++) {
    if (c < cols && midRow < rows) wallMap[c][midRow] = true;
  }
  for (let c = cols - 5; c < cols; c++) {
    if (c >= 0 && midRow < rows) wallMap[c][midRow] = true;
  }

  // Carve corridors (skip barrier zones)
  for (let c = 0; c < cols; c++) {
    if (c < 5 || c >= cols - 5) continue;
    if (wallMap[c][midRow] && rng.next() < 0.7) wallMap[c][midRow] = false;
  }
  for (let c = 10; c < cols; c += 12) {
    for (let r = 0; r < rows; r++) {
      if (wallMap[c][r] && rng.next() < 0.6) wallMap[c][r] = false;
    }
  }

  const tanks = [
    { id: 0, name: 'Alpha',   color: 'tank-green',  x: 2, y: 0,             dir: DIRECTIONS.RIGHT, alive: true, shootCD: 6, moveCD: 0, kills: 0 },
    { id: 1, name: 'Bravo',   color: 'tank-blue',   x: cols - 3, y: 0,      dir: DIRECTIONS.LEFT,  alive: true, shootCD: 8, moveCD: 0, kills: 0 },
    { id: 2, name: 'Charlie', color: 'tank-red',    x: 1, y: rows - 1,      dir: DIRECTIONS.RIGHT, alive: true, shootCD: 7, moveCD: 0, kills: 0 },
    { id: 3, name: 'Delta',   color: 'tank-orange', x: cols - 2, y: rows - 1, dir: DIRECTIONS.LEFT,  alive: true, shootCD: 10, moveCD: 0, kills: 0 },
  ];

  const bullets = [];
  let bulletIdCounter = 0;
  const allBullets = [];
  const explosions = [];
  const wallEvents = [];
  const muzzleFlashes = [];
  const killEvents = [];      // { killerId, victimId, frame }
  const frames = [];

  function isOpen(c, r) {
    return c >= 0 && c < cols && r >= 0 && r < rows && !wallMap[c][r];
  }
  function isWall(c, r) {
    return c >= 0 && c < cols && r >= 0 && r < rows && wallMap[c][r];
  }
  function tankAt(c, r, excludeId) {
    return tanks.find(t => t.alive && t.id !== excludeId && t.x === c && t.y === r);
  }

  function hasLineOfSight(x1, y1, x2, y2) {
    if (x1 === x2) {
      const step = y2 > y1 ? 1 : -1;
      for (let y = y1 + step; y !== y2; y += step) {
        if (wallMap[x1][y]) return false;
      }
      return true;
    }
    if (y1 === y2) {
      const step = x2 > x1 ? 1 : -1;
      for (let x = x1 + step; x !== x2; x += step) {
        if (wallMap[x][y1]) return false;
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
    while (queue.length > 0 && itr < 800) {
      itr++;
      const cur = queue.shift();
      for (const dir of DIR_LIST) {
        const nx = cur.x + dir.dx, ny = cur.y + dir.dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (!isOpen(nx, ny) && !(nx === toX && ny === toY)) continue;
        if (tankAt(nx, ny, tankId) && !(nx === toX && ny === toY)) continue;
        visited.add(key);
        const fd = cur.firstDir || dir;
        if (nx === toX && ny === toY) return fd;
        queue.push({ x: nx, y: ny, firstDir: fd });
      }
    }
    return null;
  }

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

    // Priority 2: Shoot blocking wall toward enemy (if no BFS path exists)
    if (tank.shootCD <= 0) {
      // First check if BFS can find a path at all
      const hasPath = bfsNextStep(tank.x, tank.y, enemy.x, enemy.y, tank.id);

      if (!hasPath) {
        // No open path — shoot the nearest wall in enemy direction
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
        // Also try all directions if primary ones don't have a wall
        for (const dir of [...primaryDirs, ...DIR_LIST]) {
          const wx = tank.x + dir.dx, wy = tank.y + dir.dy;
          if (isWall(wx, wy)) {
            fireBullet(tank, dir, frameIndex);
            return;
          }
        }
      } else {
        // Path exists but maybe a wall is between us on a cardinal line — shoot it for a shortcut
        const edx = enemy.x - tank.x;
        const edy = enemy.y - tank.y;
        let cardinalDir = null;
        if (edx === 0 && edy !== 0) cardinalDir = edy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP;
        else if (edy === 0 && edx !== 0) cardinalDir = edx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;

        if (cardinalDir) {
          const wx = tank.x + cardinalDir.dx, wy = tank.y + cardinalDir.dy;
          if (isWall(wx, wy)) {
            fireBullet(tank, cardinalDir, frameIndex);
            return;
          }
        }
      }
    }

    // Priority 3: Move toward enemy
    if (tank.moveCD > 0) return;

    let moveDir = bfsNextStep(tank.x, tank.y, enemy.x, enemy.y, tank.id);

    // Priority 4: Random walk
    if (!moveDir) {
      const openDirs = DIR_LIST.filter(d => {
        const nx = tank.x + d.dx, ny = tank.y + d.dy;
        return isOpen(nx, ny) && !tankAt(nx, ny, tank.id);
      });
      if (openDirs.length > 0) moveDir = rng.pick(openDirs);
    }

    if (moveDir) {
      const nx = tank.x + moveDir.dx, ny = tank.y + moveDir.dy;
      if (isOpen(nx, ny) && !tankAt(nx, ny, tank.id)) {
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

        // DESPAWN: out of bounds
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
          bullet.alive = false;
          bullet.deathFrame = frameIndex;
          break;
        }

        // DESPAWN: hit wall → destroy wall instantly
        if (wallMap[nx][ny]) {
          wallMap[nx][ny] = false;    // wall destroyed in one shot
          wallEvents.push({ col: nx, row: ny, frame: frameIndex });
          explosions.push({ x: nx, y: ny, frame: frameIndex, type: 'wall' });
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

  // === MAIN LOOP ===
  for (let frame = 0; frame < maxFrames; frame++) {
    frames.push({
      frame,
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
          frame: frame + extra + 1,
          tanks: tanks.map(t => ({
            id: t.id, x: t.x, y: t.y, dir: t.dir,
            alive: t.alive, color: t.color, name: t.name, kills: t.kills,
          })),
          bullets: [],
        });
      }
      break;
    }

    const order = rng.shuffle([0, 1, 2, 3]);
    for (const idx of order) tankAction(tanks[idx], frame);
    updateBullets(frame);
  }

  const initialGrid = grid.map(col => col.map(cell => ({ ...cell })));
  const aliveFinal = tanks.filter(t => t.alive);
  const winner = aliveFinal.length === 1 ? aliveFinal[0] : null;
  return { frames, allBullets, explosions, wallEvents, muzzleFlashes, killEvents, tanks, winner, grid, cols, rows, wallMap, initialGrid };
}

module.exports = { simulateGame, DIRECTIONS };
