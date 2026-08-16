/**
 * core/domain/map.ts —— 地图数据模型 + 程序化生成
 *
 * 布局规格（用户 v1.5.3，15×13）：
 *   - 固定 15×13；**不可破坏硬墙占全部格子的 48%–55%**（195 格 → 94~107 格）
 *   - 硬墙**散点放置**：不允许出现 3×3 连续硬方块，2×2 也尽量少（85% 概率拒绝）
 *   - 外圈硬墙封闭；四边内圈通路、中心 3×3 广场、出生区 3×3 常空
 *   - 软墙（可炸障碍）散点铺在内部空地上，每个软墙至少有一个相邻空地 →
 *     **放炸弹的人总有安全格可站**
 *   - 全程 180° 中心对称（硬墙、软墙、隐藏道具、连通性拆墙均镜像）
 */
import {
  Difficulty,
  TileType,
  type CellData,
  type MapData,
} from '../../shared/types';
import type { RNGService } from '../services/rng-service';
import type { CellPos } from './grid';
import { rollBlockDrop } from './entity';

const DEFAULT_WIDTH = 15;
const DEFAULT_HEIGHT = 13;

const DIRS4 = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function emptyCell(): CellData {
  return { type: TileType.EMPTY, hiddenPowerUp: null };
}

export function createMap(
  difficulty: Difficulty,
  rng: RNGService,
  spawns: CellPos[],
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
): MapData {
  const cells: CellData[][] = [];
  for (let y = 0; y < height; y++) {
    cells.push([]);
    for (let x = 0; x < width; x++) cells[y].push(emptyCell());
  }

  const isSpawnZone = (x: number, y: number) =>
    spawns.some((s) => Math.abs(s.x - x) <= 1 && Math.abs(s.y - y) <= 1);
  // 中心广场（3×3，始终空出）
  const inCenterPlaza = (x: number, y: number) =>
    x >= (width - 3) / 2 && x <= (width - 1) / 2 + 1 && y >= (height - 3) / 2 && y <= (height - 1) / 2 + 1;
  // 中心对称镜像
  const mirror = (x: number, y: number) => ({ x: width - 1 - x, y: height - 1 - y });
  const axisX = (width - 1) / 2;
  const axisY = (height - 1) / 2;
  const isFirstHalf = (x: number, y: number) =>
    x < axisX || (x === axisX && y <= axisY);

  // 1. 外圈硬墙（边界封闭，永不破坏）
  for (let x = 0; x < width; x++) {
    cells[0][x].type = TileType.WALL;
    cells[height - 1][x].type = TileType.WALL;
  }
  for (let y = 0; y < height; y++) {
    cells[y][0].type = TileType.WALL;
    cells[y][width - 1].type = TileType.WALL;
  }

  // 2. 内部散点区：四边内圈通路（行/列 1 与 h-2/w-2）、中心 3×3 广场、出生区 3×3 保持空
  const scatterZone: CellPos[] = [];
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      if (isSpawnZone(x, y)) continue; // 出生区 3×3 常空
      if (inCenterPlaza(x, y)) continue; // 中心广场常空
      if (!isFirstHalf(x, y)) continue; // 只处理前半区（后半区由镜像填充，保持中心对称）
      scatterZone.push({ x, y });
    }
  }

  // 3. 散点放置硬墙（约束：不出现 3×3 连续硬块；2×2 尽量少）
  //    目标：外圈 52 + 内部 H_scatter ∈ [94,107]（48%~55%）→ H_scatter = 44/48/52 按难度；
  //    hardTarget 以"对"计（每对含 180° 镜像 2 格）
  const hardTarget =
    difficulty === Difficulty.EASY ? 21 : difficulty === Difficulty.NORMAL ? 22 : 24;
  const isHard = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && cells[y][x].type === TileType.WALL;

  /** 在 (x,y) 放硬墙是否会形成 3×3 全硬窗口（仅内部窗口：含内圈通路的窗口必含空地，天然安全） */
  const wouldCreate3x3 = (x: number, y: number): boolean => {
    for (let wy = Math.max(2, y - 2); wy <= Math.min(y, height - 4); wy++) {
      for (let wx = Math.max(2, x - 2); wx <= Math.min(x, width - 4); wx++) {
        let all = true;
        outer: for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 3; i++) {
            const cx = wx + i;
            const cy = wy + j;
            if (!(cx === x && cy === y) && !isHard(cx, cy)) {
              all = false;
              break outer;
            }
          }
        }
        if (all) return true;
      }
    }
    return false;
  };
  /** 在 (x,y) 放硬墙是否会形成 2×2 全硬窗口 */
  const wouldCreate2x2 = (x: number, y: number): boolean => {
    for (let wy = Math.max(2, y - 1); wy <= Math.min(y, height - 3); wy++) {
      for (let wx = Math.max(2, x - 1); wx <= Math.min(x, width - 3); wx++) {
        let all = true;
        outer: for (let j = 0; j < 2; j++) {
          for (let i = 0; i < 2; i++) {
            const cx = wx + i;
            const cy = wy + j;
            if (!(cx === x && cy === y) && !isHard(cx, cy)) {
              all = false;
              break outer;
            }
          }
        }
        if (all) return true;
      }
    }
    return false;
  };

  /** 在 (x,y) 放硬墙后，其相邻空位是否会被四邻硬墙围死（死口袋 → 连通性拆墙会削硬墙数） */
  const wouldCreatePocket = (x: number, y: number): boolean => {
    for (const d of DIRS4) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (cells[ny][nx].type !== TileType.EMPTY) continue;
      let all = true;
      for (const dd of DIRS4) {
        const ax = nx + dd.x;
        const ay = ny + dd.y;
        if (ax === x && ay === y) continue; // 即将变硬
        if (!isHard(ax, ay)) {
          all = false;
          break;
        }
      }
      if (all) return true;
    }
    return false;
  };

  const tryPlaceHard = (x: number, y: number, reject2x2: boolean): boolean => {
    const m = mirror(x, y);
    if (cells[y][x].type !== TileType.EMPTY || cells[m.y][m.x].type !== TileType.EMPTY) return false;
    if (wouldCreate3x3(x, y) || wouldCreate3x3(m.x, m.y)) return false;
    if (wouldCreatePocket(x, y) || wouldCreatePocket(m.x, m.y)) return false; // 防围死空位
    if (reject2x2 && (wouldCreate2x2(x, y) || wouldCreate2x2(m.x, m.y))) {
      if (rng.chance(0.5)) return false; // 50% 拒绝 2×2（少留空洞、减少死锁；2×2 仍少量）
    }
    cells[y][x] = { type: TileType.WALL, hiddenPowerUp: null };
    cells[m.y][m.x] = { type: TileType.WALL, hiddenPowerUp: null };
    return true;
  };
  // 洗牌散点区
  for (let i = scatterZone.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = scatterZone[i];
    scatterZone[i] = scatterZone[j];
    scatterZone[j] = t;
  }
  const hardCount = (): number => {
    let n = 0;
    for (const row of cells) for (const c of row) if (c.type === TileType.WALL) n++;
    return n;
  };
  // 第一阶段：有机随机散点（少量，给棋盘保底留空间）
  let placed = 0;
  const organicTarget = Math.max(0, hardTarget - 8);
  for (const c of scatterZone) {
    if (placed >= organicTarget) break;
    if (tryPlaceHard(c.x, c.y, true)) placed++;
  }
  // 第二阶段：按棋盘格位（天然无 2×2/3×3 且 180° 对称）宽松填充空位——保证密度可达
  for (const c of scatterZone) {
    if (placed >= hardTarget) break;
    if ((c.x + c.y) % 2 !== 0) continue; // 只补棋盘"硬"位
    if (cells[c.y][c.x].type !== TileType.EMPTY) continue;
    if (tryPlaceHard(c.x, c.y, false)) placed++;
  }
  // 第三阶段：重洗多轮重试（放宽 2×2，3×3 仍禁止），直到达标或连续多轮无进展
  let stallRounds = 0;
  while (placed < hardTarget && stallRounds < 20) {
    let roundPlaced = 0;
    for (let i = scatterZone.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = scatterZone[i];
      scatterZone[i] = scatterZone[j];
      scatterZone[j] = t;
    }
    for (const c of scatterZone) {
      if (placed >= hardTarget) break;
      if (tryPlaceHard(c.x, c.y, false)) {
        placed++;
        roundPlaced++;
      }
    }
    if (roundPlaced === 0) stallRounds++;
    else stallRounds = 0;
  }

  // 4. 放置软墙（可炸障碍）：目标 ~45——**软墙的设置必须考虑安全区域（人物可站）**。
  //    顺序很关键：先放四边连通路径（内圈）软墙，再做散点区——散点贪心把"已成软墙的
  //    环线格"当作非空地，不会依赖它们作安全格，避免后放的环线软墙把散点软墙的
  //    安全格变成软墙导致大量还原。软墙只占空位，不影响硬墙生成。
  const scatterKeys = new Set(scatterZone.map((c) => `${c.x},${c.y}`));
  const hasPermanentEmptyNeighbor = (x: number, y: number): boolean =>
    DIRS4.some((d) => {
      const nx = x + d.x;
      const ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false;
      if (cells[ny][nx].type !== TileType.EMPTY) return false;
      return !scatterKeys.has(`${nx},${ny}`); // 常空区（四边通路/中心广场/出生区，未被软墙占用）
    });
  const hasEmptyNeighbor = (x: number, y: number): boolean =>
    DIRS4.some((d) => {
      const nx = x + d.x;
      const ny = y + d.y;
      return nx >= 0 && ny >= 0 && nx < width && ny < height && cells[ny][nx].type === TileType.EMPTY;
    });
  const placeSoft = (x: number, y: number): void => {
    const hidden = rollBlockDrop(rng);
    const m = mirror(x, y);
    cells[y][x] = { type: TileType.SOFT, hiddenPowerUp: hidden };
    cells[m.y][m.x] = { type: TileType.SOFT, hiddenPowerUp: hidden };
  };
  // ④ 先放四边连通路径（内圈行/列）上的软墙（出生区 3×3 的内圈格保持空）
  const ringSoftDensity =
    difficulty === Difficulty.EASY ? 0.85 : difficulty === Difficulty.NORMAL ? 0.8 : 0.75;
  for (let x = 1; x < width - 1; x++) {
    for (const y of [1, height - 2]) {
      if (!isFirstHalf(x, y)) continue;
      if (isSpawnZone(x, y)) continue; // 出生区 3×3 常空
      if (rng.chance(ringSoftDensity)) placeSoft(x, y);
    }
  }
  for (let y = 2; y < height - 2; y++) {
    for (const x of [1, width - 2]) {
      if (!isFirstHalf(x, y)) continue;
      if (isSpawnZone(x, y)) continue;
      if (rng.chance(ringSoftDensity)) placeSoft(x, y);
    }
  }
  // ④b 环线保底：四边软墙不足 12 格时，在"仍有空地邻居"的环线空位补到下限
  //     （此后这些空位不会变软墙/硬墙，必存活于安全检查与校准）
  let ringSoftCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((y === 1 || y === height - 2 || x === 1 || x === width - 2) &&
        cells[y][x].type === TileType.SOFT) ringSoftCount++;
    }
  }
  for (let x = 1; x < width - 1 && ringSoftCount < 12; x++) {
    for (const y of [1, height - 2]) {
      if (ringSoftCount >= 12) break;
      if (!isFirstHalf(x, y)) continue;
      if (isSpawnZone(x, y)) continue;
      if (cells[y][x].type !== TileType.EMPTY) continue;
      if (!hasEmptyNeighbor(x, y)) continue;
      placeSoft(x, y);
      ringSoftCount += 2;
    }
  }
  // 散点区软墙：**最大覆盖贪心**——未被"常空区/安全区"覆盖的非硬墙散点格，每轮选
  //  "覆盖最多未覆盖格"的格作安全区（含 180° 镜像），直到全覆盖。安全区数量最少 →
  //  软墙最多；每个软墙都紧邻安全区/常空区空地（人物必有可站之处）。
  const safeSpots = new Set<string>();
  {
    const uncovered = new Set<string>();
    for (const c of scatterZone) {
      if (cells[c.y][c.x].type !== TileType.EMPTY) continue;
      if (hasPermanentEmptyNeighbor(c.x, c.y)) continue;
      uncovered.add(`${c.x},${c.y}`);
    }
    let guard = 0;
    while (uncovered.size > 0 && guard++ < 60) {
      let best: CellPos | null = null;
      let bestCover = -1;
      for (const c of scatterZone) {
        if (!uncovered.has(`${c.x},${c.y}`)) continue; // 只选未覆盖格（常空邻接的格直接放软墙）
        let cover = 0;
        const cnt = (x: number, y: number): void => {
          if (uncovered.has(`${x},${y}`)) cover++;
        };
        cnt(c.x, c.y);
        for (const d of DIRS4) cnt(c.x + d.x, c.y + d.y);
        if (cover > bestCover) {
          bestCover = cover;
          best = c;
        }
      }
      if (!best || bestCover <= 0) break;
      const m = mirror(best.x, best.y);
      safeSpots.add(`${best.x},${best.y}`);
      safeSpots.add(`${m.x},${m.y}`);
      const remove = (x: number, y: number): void => {
        uncovered.delete(`${x},${y}`);
      };
      remove(best.x, best.y);
      for (const d of DIRS4) remove(best.x + d.x, best.y + d.y);
      for (const d of DIRS4) remove(m.x + d.x, m.y + d.y);
    }
  }
  const isSafeSpot = (x: number, y: number): boolean => safeSpots.has(`${x},${y}`);
  // 其余非安全区、非硬墙散点格 → 全部放软墙
  for (const c of scatterZone) {
    if (cells[c.y][c.x].type !== TileType.EMPTY) continue;
    if (isSafeSpot(c.x, c.y)) continue;
    placeSoft(c.x, c.y);
  }

  // ④c 目标裁剪：软墙总数（散点 + 环线）目标 ~45（EASY 46 / NORMAL 45 / HARD 44，±2），
  //    超出则把散点软墙（成对镜像）裁回空地——裁掉即变成更多安全区，约束只增不减
  const softTargetTotal =
    difficulty === Difficulty.EASY ? 46 : difficulty === Difficulty.NORMAL ? 45 : 44;
  const countSoft = (): number => {
    let n = 0;
    for (const row of cells) for (const c of row) if (c.type === TileType.SOFT) n++;
    return n;
  };
  if (countSoft() > softTargetTotal) {
    const trimCandidates: CellPos[] = [];
    for (const c of scatterZone) {
      if (cells[c.y][c.x].type === TileType.SOFT) trimCandidates.push(c);
    }
    for (let i = trimCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = trimCandidates[i];
      trimCandidates[i] = trimCandidates[j];
      trimCandidates[j] = t;
    }
    for (const c of trimCandidates) {
      if (countSoft() <= softTargetTotal) break;
      const m = mirror(c.x, c.y);
      cells[c.y][c.x] = emptyCell();
      cells[m.y][m.x] = emptyCell();
    }
  }

  // 5. 安全检查：任何"四邻全非空地"的软墙 → 还原为空地（保证放炸弹的人有安全格可站）
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x].type !== TileType.SOFT) continue;
      if (hasEmptyNeighbor(x, y)) continue;
      const m = mirror(x, y);
      cells[y][x] = emptyCell();
      cells[m.y][m.x] = emptyCell();
    }
  }

  // 6. 出生点清空
  for (const s of spawns) {
    cells[s.y][s.x] = emptyCell();
  }

  // 7. 稳定化循环（最多 4 轮，均罕见）：软墙安全检查 → 连通性拆墙 → 硬墙校准，
  //    直到一轮无任何变化。注意顺序：校准补硬墙可能让软墙失去唯一空地邻居（被安全检查
  //    还原成空地 → 可能成为新口袋），因此三件事必须循环到稳定。
  const countHard = (): number => {
    let n = 0;
    for (const row of cells) for (const c of row) if (c.type === TileType.WALL) n++;
    return n;
  };
  const minHard = Math.ceil((width * height) * 0.48); // 195 × 48% = 94
  const calibrateHard = (): boolean => {
    if (countHard() >= minHard) return false;
    const candidates: CellPos[] = [];
    for (const c of scatterZone) {
      if (cells[c.y][c.x].type !== TileType.EMPTY) continue;
      candidates.push(c);
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = t;
    }
    let added = false;
    for (const c of candidates) {
      if (countHard() >= minHard) break;
      if (!tryPlaceHard(c.x, c.y, true)) continue;
      // 洪泛验证：放置后所有空地仍从出生点可达（防大环围死）
      const reachable = floodReachable(cells, width, height, spawns[0]);
      const m = mirror(c.x, c.y);
      let ok = true;
      for (let y = 0; y < height && ok; y++) {
        for (let x = 0; x < width && ok; x++) {
          if (cells[y][x].type === TileType.EMPTY && !reachable.has(`${x},${y}`)) ok = false;
        }
      }
      if (!ok) {
        cells[c.y][c.x] = emptyCell();
        cells[m.y][m.x] = emptyCell();
      } else {
        added = true;
      }
    }
    return added;
  };
  for (let round = 0; round < 4; round++) {
    let changed = false;
    // a) 软墙安全检查：任何"四邻全非空地"的软墙 → 还原为空地（放炸弹的人有安全格可站）
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (cells[y][x].type !== TileType.SOFT) continue;
        if (hasEmptyNeighbor(x, y)) continue;
        const m = mirror(x, y);
        cells[y][x] = emptyCell();
        cells[m.y][m.x] = emptyCell();
        changed = true;
      }
    }
    // b) 连通性保证：所有空地必须从玩家出生点可达（拆围死口袋的墙，成对镜像）
    if (ensureConnectivity(cells, width, height, spawns[0], mirror)) changed = true;
    // c) 硬墙校准：连通性拆墙削掉的硬墙对称补回
    if (calibrateHard()) changed = true;
    if (!changed) break;
  }

  // 8. 软墙最终补足：稳定化后把仍有相邻空地的空位补放软墙到目标（~45±2），
  //    每轮补放后立即还原"失去安全格"的软墙（补放可能吞掉相邻软墙的安全格），
  //    多轮收敛：最终每个软墙都紧邻空地（人物可站），数量趋近几何上限。
  if (countSoft() < softTargetTotal) {
    const addCandidates: CellPos[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (!isFirstHalf(x, y)) continue;
        if (cells[y][x].type !== TileType.EMPTY) continue;
        if (isSpawnZone(x, y)) continue;
        const m = mirror(x, y);
        if (cells[m.y][m.x].type !== TileType.EMPTY) continue;
        if (isSpawnZone(m.x, m.y)) continue;
        addCandidates.push({ x, y });
      }
    }
    for (let round = 0; round < 8 && countSoft() < softTargetTotal; round++) {
      // 洗牌每轮顺序，避免偏置
      for (let i = addCandidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        const t = addCandidates[i];
        addCandidates[i] = addCandidates[j];
        addCandidates[j] = t;
      }
      let added = false;
      for (const c of addCandidates) {
        if (countSoft() >= softTargetTotal) break;
        const m = mirror(c.x, c.y);
        if (cells[c.y][c.x].type !== TileType.EMPTY || cells[m.y][m.x].type !== TileType.EMPTY) continue;
        if (!hasEmptyNeighbor(c.x, c.y) || !hasEmptyNeighbor(m.x, m.y)) continue;
        placeSoft(c.x, c.y);
        added = true;
      }
      // 还原失去安全格的软墙（补放吞掉了相邻软墙的空地邻居）
      let reverted = false;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (cells[y][x].type !== TileType.SOFT) continue;
          if (hasEmptyNeighbor(x, y)) continue;
          const m = mirror(x, y);
          cells[y][x] = emptyCell();
          cells[m.y][m.x] = emptyCell();
          reverted = true;
        }
      }
      if (!added && !reverted) break;
    }
  }

  return { width, height, cells, theme: '' };
}

/** 从 start 洪泛，返回所有"非硬墙"格（空地 + 可炸软墙——**软墙也算连通区域**） */
function floodReachable(
  cells: CellData[][],
  width: number,
  height: number,
  start: CellPos,
): Set<string> {
  const seen = new Set<string>([`${start.x},${start.y}`]);
  const stack: CellPos[] = [{ x: start.x, y: start.y }];
  while (stack.length > 0) {
    const c = stack.pop()!;
    for (const d of DIRS4) {
      const nx = c.x + d.x;
      const ny = c.y + d.y;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen.has(key)) continue;
      if (cells[ny][nx].type === TileType.WALL) continue;
      seen.add(key);
      stack.push({ x: nx, y: ny });
    }
  }
  return seen;
}

/** 连通性保证：反复拆除"围死空地口袋"的硬墙（拆除成对镜像，保持中心对称）。
 *  软墙也算连通区域（洪泛时软墙可通行），故口袋只可能被**硬墙**围死；
 *  口袋为多格区域（空地+软墙混合）——先洪泛整个口袋区域，再拆其边界上"贴着可达区"
 *  的硬墙；否则拆任意边界墙。返回是否拆除过。 */
function ensureConnectivity(
  cells: CellData[][],
  width: number,
  height: number,
  spawn: CellPos,
  mirror: (x: number, y: number) => { x: number; y: number },
): boolean {
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const removeWall = (x: number, y: number): void => {
    if (inBounds(x, y) && cells[y][x].type === TileType.WALL) cells[y][x] = emptyCell();
  };
  let removedAny = false;
  for (let guard = 0; guard < 400; guard++) {
    const reachable = floodReachable(cells, width, height, spawn);
    let seed: CellPos | null = null;
    outer: for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (cells[y][x].type === TileType.EMPTY && !reachable.has(`${x},${y}`)) {
          seed = { x, y };
          break outer;
        }
      }
    }
    if (!seed) break;
    // 洪泛整个口袋区域（空地 + 软墙，软墙视为可通行）
    const region = new Set<string>([`${seed.x},${seed.y}`]);
    const stack: CellPos[] = [{ x: seed.x, y: seed.y }];
    while (stack.length > 0) {
      const c = stack.pop()!;
      for (const d of DIRS4) {
        const nx = c.x + d.x;
        const ny = c.y + d.y;
        const key = `${nx},${ny}`;
        if (!inBounds(nx, ny) || region.has(key)) continue;
        if (cells[ny][nx].type === TileType.WALL) continue;
        region.add(key);
        stack.push({ x: nx, y: ny });
      }
    }
    // 拆一块"贴着可达区"的边界硬墙（优先）
    let removed = false;
    outer2: for (const key of region) {
      const [px, py] = key.split(',').map(Number);
      for (const d of DIRS4) {
        const wx = px + d.x;
        const wy = py + d.y;
        if (!inBounds(wx, wy) || cells[wy][wx].type !== TileType.WALL) continue;
        const touchesReachable = DIRS4.some(
          (dd) => inBounds(wx + dd.x, wy + dd.y) && reachable.has(`${wx + dd.x},${wy + dd.y}`),
        );
        if (touchesReachable) {
          removeWall(wx, wy);
          const m = mirror(wx, wy);
          removeWall(m.x, m.y); // 对称拆除
          removed = true;
          removedAny = true;
          break outer2;
        }
      }
    }
    // 兜底：拆任意边界硬墙（合并相邻口袋，下一轮继续）
    if (!removed) {
      outer3: for (const key of region) {
        const [px, py] = key.split(',').map(Number);
        for (const d of DIRS4) {
          const wx = px + d.x;
          const wy = py + d.y;
          if (!inBounds(wx, wy) || cells[wy][wx].type !== TileType.WALL) continue;
          removeWall(wx, wy);
          const m = mirror(wx, wy);
          removeWall(m.x, m.y);
          removed = true;
          removedAny = true;
          break outer3;
        }
      }
    }
    if (!removed) break; // 理论不会发生：口袋必有边界硬墙
  }
  return removedAny;
}
