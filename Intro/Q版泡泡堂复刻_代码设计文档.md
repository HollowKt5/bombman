# 《泡泡大作战》代码设计文档 v2.0

> 对应游戏设计文档（GDD）与美术风格文档，本文件为 AI 开发者实现时的**唯一技术规格依据**。
> 所有技术约束、架构决策、算法伪代码、目录结构均在此定义。修改需求请写入 Feedback 文件，逐条实施并更新版本号。

---

## 1. 项目概述

| 项目 | 内容 |
|---|---|
| 游戏名 | 泡泡大作战（暂定，规避版权风险） |
| 类型 | 本地单人闯关 / 双人 PK · 炸弹人-like |
| 平台 | 网页（PC + 移动端横屏） |
| 技术栈 | TypeScript（ES Module, ES2020）+ 手写 Canvas 2D + Vite + vite-plugin-singlefile |
| 产出 | 单文件 `dist/index.html`，双击即运行，兼容任意静态托管 |
| 运行时依赖 | **零第三方依赖**（仅 Vite/Vitest 为开发期工具） |
| 存档 | IndexedDB |

---

## 2. 技术铁律（不可违反）

1. **逻辑与表现彻底分离**：`core/` 不得引用 `window` / `document` / `Canvas` 等任何浏览器 API。
2. **依赖单向**：表现层 → 服务层（接口）→ 逻辑层。`shared/` 无依赖；`core/` 只能 import `shared/`。
3. **随机性必须可复现**：逻辑层禁止 `Math.random`，所有随机走**种子化 RNG**（Mulberry32）。
4. **纯函数规则层**：`core/rules/` 下函数**不修改入参**，返回新数据或结果，可独立单测。
5. **固定步长 60Hz Tick**：逻辑帧与渲染帧解耦，高刷不空转、卡顿不加速。
6. **数据驱动**：角色属性、道具效果、关卡配置全部 JSON/TS 常量表，加内容不改核心循环。

---

## 3. 目录结构与依赖方向

```
src/
├── shared/                         # 公共类型、数值常量、事件总线
│   ├── types.ts                    # 所有领域接口（interface）+ 枚举
│   ├── constants.ts                # 数值常量表（见第7章）
│   ├── event-bus.ts                # 泛型发布/订阅（表现层→逻辑层单向通知）
│   └── config.ts                   # 数值可调表（JSON结构，含类型校验）
│
├── core/                           # 逻辑层（纯数据，零浏览器API）
│   ├── domain/                     # 纯数据模型 + 工厂函数（不import浏览器API）
│   │   ├── map.ts                  # MapData, CellData
│   │   ├── entity.ts               # Player, Bomb, Explosion, PowerUp, Particle
│   │   └── game-state.ts           # GameState（状态容器 + 工厂）
│   │
│   ├── rules/                      # 纯函数规则层（输入数据→输出，不修改入参）
│   │   ├── movement.ts             # 碰撞检测、移动合法性（tryMove）
│   │   ├── bomb.ts                 # 放置泡泡、爆炸水柱计算、连锁传播（detonateChain）
│   │   ├── powerup.ts              # 道具掉落、拾取、效果应用
│   │   ├── damage.ts               # 受伤判定、泡封状态、营救、死亡
│   │   └── ai.ts                   # AI决策（纯函数，接收视野返回InputIntent）
│   │
│   ├── systems/                    # 无状态行为模块，每tick推进（允许原地改state）
│   │   ├── move-system.ts         # 应用移动输入→调用rules/movement
│   │   ├── bomb-system.ts         # 泡泡计时器递减、到期触发爆炸
│   │   ├── explosion-system.ts    # 水柱扩散表现tick、连锁爆炸触发
│   │   ├── powerup-system.ts      # 道具生成、拾取检测、过期清理
│   │   ├── ai-system.ts          # 为AI玩家生成InputIntent
│   │   ├── camera-system.ts      # 屏外休眠判断、可视区计算
│   │   └── game-loop.ts          # 固定步长tick调度器（accumulator模式）
│   │
│   └── services/                  # 抽象接口（定义契约，不含实现）
│       ├── rng-service.ts         # RNGService接口（seed-based）
│       ├── storage-service.ts     # StorageService接口（IndexedDB契约）
│       └── audio-service.ts       # AudioService接口（Web Audio合成契约）
│
├── infrastructure/                # 实现层（浏览器API、第三方能力）
│   ├── seed-rng.ts                # Mulberry32种子RNG（implements RNGService）
│   ├── indexed-db-storage.ts      # IndexedDB实现（implements StorageService）
│   ├── web-audio-synth.ts         # Web Audio合成音效（implements AudioService）
│   └── input-router.ts            # 键盘/触控→InputIntent（纯数据转换）
│
├── presentation/                  # 表现层（Canvas渲染、DOM UI、输入绑定）
│   ├── renderer/
│   │   ├── main-renderer.ts      # 主渲染循环：清屏→地图→实体→粒子→HUD
│   │   ├── map-renderer.ts       # 网格地图绘制（瓦片程序化形状+假阴影）
│   │   ├── entity-renderer.ts    # 角色/泡泡/水柱/道具（程序化矢量绘制）
│   │   ├── particle-renderer.ts  # 粒子系统渲染（爆炸碎片、得分飘字、屏幕震动）
│   │   └── hud-renderer.ts       # HUD（生命心数、道具栏、关卡倒计时、分数）
│   │
│   ├── input/                    # 输入源
│   │   ├── keyboard-input.ts      # 键鼠监听 → InputIntent
│   │   └── touch-input.ts         # 虚拟摇杆+放泡键 → InputIntent
│   │
│   ├── dom-ui/                   # DOM覆盖层（菜单、设置、结算）
│   │   ├── main-menu.ts           # 主菜单（模式选择、难度、开始）
│   │   ├── settings-panel.ts      # 设置（音量、键位、横竖屏提示）
│   │   └── result-screen.ts       # 结算界面（胜利/失败、分数、重试）
│   │
│   └── app.ts                    # 入口：装配所有模块，启动游戏循环
│
└── test/                          # Vitest单测（对应rules/每个文件）
    ├── movement.test.ts
    ├── bomb.test.ts
    ├── powerup.test.ts
    ├── damage.test.ts
    └── ai.test.ts
```

### 依赖方向图

```
presentation/ ──▶ core/systems/ ──▶ core/rules/ ──▶ core/domain/ ──▶ shared/
     │                  │                │                │
     ▼                  ▼                ▼                ▼
infrastructure/ ◀──── services（接口）   （仅import）    （仅import）
```

`core/` 与 `shared/` **不得**引用 `window/document/Canvas`/`localStorage` 等浏览器 API。

---

## 4. 核心数据流

```
┌──────────────┐    InputIntent[]     ┌─────────────────┐    GameEvent[]    ┌──────────────┐
│  INPUT层     │ ────────────────────▶ │  GAME LOOP      │ ────────────────▶ │  EVENT BUS   │
│ (keyboard/   │                       │ (60Hz fixed tick)│  emit             │ (表现层订阅)  │
│  touch)      │                       │                 │                   │              │
└──────────────┘                       └─────────────────┘                   └──────┬───────┘
                                                                                 │ subscribe
                                                                                 ▼
                                                                          ┌──────────────┐
                                                                          │  RENDER层    │
                                                                          │ (Canvas 2D)  │
                                                                          │ + DOM UI     │
                                                                          └──────────────┘
```

**两条通道（只有两条）：**
1. `InputIntent`（表现→逻辑）：方向、是否放泡。**纯数据**，不含任何渲染信息。
2. `GameEvent`（逻辑→表现）：爆炸、受伤、拾取、死亡、胜利。**纯数据**，渲染层订阅后做动画/音效/粒子。

逻辑层**不主动推**任何渲染调用——它只 emit 事件，渲染层自行决定如何表现。

---

## 5. 核心数据结构（domain，节选关键类型）

> 完整类型定义在 `src/shared/types.ts`，此处给出骨架。

```typescript
// ── 枚举 ──
export enum TileType { EMPTY = 0, WALL = 1, SOFT = 2 }       // 空/不可破坏墙/可炸方块
export enum Direction { UP, DOWN, LEFT, RIGHT, NONE }
export enum PowerUpType {
  SPEED, BOMB_COUNT, BOMB_RANGE, KICK, SHIELD, INVINCIBLE, GRENADE
}
export enum GamePhase { MENU, PLAYING, PAUSED, VICTORY, DEFEAT }

// ── 地图 ──
export interface CellData { type: TileType; hiddenPowerUp?: PowerUpType }
export interface MapData {
  width: number; height: number;
  cells: CellData[][];          // [y][x]
  theme: string;                // 场景主题id（森林/沙滩/糖果...）
}

// ── 实体 ──
export interface Player {
  id: number; x: number; y: number;
  direction: Direction;
  speed: number;                // 格/秒（基础值，受道具影响）
  baseSpeed: number;
  bombRange: number;            // 爆炸半径（格）
  maxBombs: number;             // 可同时放置泡泡数
  alive: boolean;
  trapped: boolean;             // 泡封中
  trapTimer: number;            // 剩余tick
  shieldTimer: number;          // 护盾剩余tick
  invincibleTimer: number;      // 无敌剩余tick
  score: number;
  isHuman: boolean;
  color: string;                // 渲染用（表现层只读，不在此逻辑）
  rngSeed: number;              // 每玩家独立种子（AI/随机可复现）
}

export interface Bomb {
  id: number; ownerId: number;
  x: number; y: number;
  timer: number;                // 剩余tick（到0引爆）
  range: number;
  exploded: boolean;
}

export interface Explosion {
  id: number; ownerId: number;
  cells: Array<{ x: number; y: number }>;
  remaining: number;            // 剩余显示tick
  total: number;
}

export interface PowerUp { id: number; x: number; y: number; type: PowerUpType }
export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

// ── 输入意图（纯数据）──
export interface InputIntent {
  playerId: number;
  direction: Direction;
  placeBomb: boolean;
}

// ── 游戏状态（唯一可变状态容器）──
export interface GameState {
  phase: GamePhase;
  map: MapData;
  players: Player[];
  bombs: Bomb[];
  explosions: Explosion[];
  powerUps: PowerUp[];
  particles: Particle[];
  tick: number;                 // 逻辑tick计数
  level: number;                // 当前关卡
  timeLeft: number;             // 关卡倒计时tick
  nextEntityId: number;         // 自增id分配器
  camera: { x: number; y: number; width: number; height: number }; // 可视区（格）
}
```

---

## 6. 关键算法（伪代码 + 实现指引）

### 6.1 固定步长 Tick 调度（systems/game-loop.ts）

```typescript
// accumulator 模式，逻辑与渲染解耦
const TICK_HZ = 60;
const TICK_MS = 1000 / TICK_HZ;   // 16.666...ms
const MAX_ACCUMULATOR = 100;      // 防螺旋死亡：最多攒100ms

let accumulator = 0;
let lastTime = performance.now();

function frame(now: number) {
  let delta = now - lastTime;
  lastTime = now;
  if (delta > MAX_ACCUMULATOR) delta = MAX_ACCUMULATOR; // 卡顿截断
  accumulator += delta;

  while (accumulator >= TICK_MS) {
    const intents = inputRouter.poll();   // 表现层采集输入 → InputIntent[]
    for (const intent of intents) {
      systems.moveSystem.apply(state, intent);
      systems.bombSystem.apply(state, intent);
    }
    systems.aiSystem.apply(state);         // 为AI玩家生成intent并apply
    systems.explosionSystem.apply(state);  // 推进爆炸tick、连锁触发
    systems.powerupSystem.apply(state);
    systems.cameraSystem.apply(state);     // 更新可视区
    state.tick++;
    if (state.timeLeft > 0) state.timeLeft--;
    accumulator -= TICK_MS;
  }

  renderer.render(state, eventBus);        // 渲染（可加插值，初期直接用state）
  requestAnimationFrame(frame);
}
```

### 6.2 移动碰撞（rules/movement.ts）

```typescript
// 纯函数：不修改player/map入参，返回新坐标
export function computeMove(
  player: Readonly<Player>,
  dir: Direction,
  map: Readonly<MapData>,
  bombs: readonly Bomb[],
  hasKick: boolean
): { x: number; y: number } {
  if (dir === Direction.NONE) return { x: player.x, y: player.y };
  const delta = dirToDelta(dir);
  const nx = player.x + delta.x;
  const ny = player.y + delta.y;

  // 1. 边界
  if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height)
    return { x: player.x, y: player.y };

  // 2. 不可破坏墙
  const cell = map.cells[ny][nx];
  if (cell.type === TileType.WALL)
    return { x: player.x, y: player.y };

  // 3. 泡泡（无踢泡则不可穿过）
  for (const b of bombs) {
    if (b.exploded) continue;
    if (b.x === nx && b.y === ny && !hasKick)
      return { x: player.x, y: player.y };
  }

  return { x: nx, y: ny };
}
```

### 6.3 爆炸水柱 + 连锁（rules/bomb.ts）

```typescript
// 十字水柱：计算炸弹影响的所有格子（墙壁阻挡，软墙自身被毁但挡住延伸）
export function computeExplosionCells(
  bx: number, by: number, range: number,
  map: Readonly<MapData>
): Array<{ x: number; y: number }> {
  const cells = [{ x: bx, y: by }];
  const dirs = [ {0,-1}, {0,1}, {-1,0}, {1,0} ];
  for (const [dx, dy] of dirs) {
    for (let r = 1; r <= range; r++) {
      const nx = bx + dx * r, ny = by + dy * r;
      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) break;
      const cell = map.cells[ny][nx];
      if (cell.type === TileType.WALL) break;     // 硬墙挡
      cells.push({ x: nx, y: ny });
      if (cell.type === TileType.SOFT) break;      // 软墙到边界止
    }
  }
  return cells;
}

// 连锁爆炸：BFS遍历所有被引爆的炸弹
export function resolveChainExplosions(
  state: GameState,
  initialBombIds: number[]
): Explosion[] {                                   // 返回新生成的Explosion列表
  const queue = state.bombs.filter(b => initialBombIds.includes(b.id));
  const exploded = new Set<number>();
  const result: Explosion[] = [];

  while (queue.length) {
    const bomb = queue.shift()!;
    if (exploded.has(bomb.id)) continue;
    exploded.add(bomb.id);
    bomb.exploded = true;

    const cells = computeExplosionCells(bomb.x, bomb.y, bomb.range, state.map);
    result.push({
      id: state.nextEntityId++, ownerId: bomb.ownerId,
      cells, remaining: EXPLOSION_DURATION_TICKS, total: EXPLOSION_DURATION_TICKS
    });

    // 标记格子上软墙摧毁
    for (const c of cells) {
      if (state.map.cells[c.y][c.x].type === TileType.SOFT)
        state.map.cells[c.y][c.x].type = TileType.EMPTY;
    }

    // 收集被本次爆炸覆盖到的其他未爆炸弹，入队
    for (const other of state.bombs) {
      if (exploded.has(other.id)) continue;
      if (cells.some(c => c.x === other.x && c.y === other.y))
        queue.push(other);
    }
  }
  // 清理已爆炸弹
  state.bombs = state.bombs.filter(b => !exploded.has(b.id));
  return result;
}
```

### 6.4 AI 决策（rules/ai.ts）

```typescript
// 纯函数：基于"视野快照"返回单个AI的InputIntent
// 视野快照 = 自身位置/状态 + 地图可读部分 + 敌人大致位置 + 爆炸威胁格集合
export function decideAI(
  self: Readonly<Player>,
  snapshot: AISenseSnapshot,   // 由ai-system构造（只读拷贝）
  rng: () => number
): InputIntent {
  // 难度分级：
  // 简单：50%概率随机走，10%概率放泡
  // 一般：BFS找最近道具，遇险逃跑，主动放泡
  // 困难：BFS找最近敌人，预判走位，利用连锁，精确避爆（多源BFS算安全格）

  // 困难AI核心：多源BFS从自身位置向外扩散，跳过爆炸威胁格，
  // 找到第一个"非威胁格"作为移动目标，再BFS找最短路径的第一步方向。
  // 若无安全格（被困），尝试向爆炸即将结束的方向移动或放泡自救。

  if (rng() < snapshot.difficulty.escapeChance && snapshot.dangerCells.size > 0) {
    return { playerId: self.id, direction: fleeDirection(self, snapshot), placeBomb: false };
  }
  // ... 其余分支
  return { playerId: self.id, direction: Direction.NONE, placeBomb: false };
}
```

**AISenseSnapshot 构造**（在 ai-system 中，从 state 读只读数据拷贝）：

```typescript
function buildSnapshot(state: GameState, player: Player): AISenseSnapshot {
  return {
    self: { x: player.x, y: player.y, trapped: player.trapped },
    dangerCells: computeDangerCells(state),   // 所有爆炸即将波及的格（含倒计时）
    powerUps: state.powerUps.map(p => ({ x: p.x, y: p.y, type: p.type })),
    enemies: state.players
      .filter(p => p.alive && p.id !== player.id)
      .map(p => ({ x: p.x, y: p.y })),
    difficulty: DIFFICULTY_TABLE[state.level % 3],
    rng: /* 该玩家独立种子rng */,
  };
}
```

### 6.5 屏外休眠 + 可视区（systems/camera-system.ts）

```typescript
// 每tick更新相机可视区（格坐标矩形），供sleep系统使用
export function updateCamera(state: GameState, viewW: number, viewH: number, cellSize: number) {
  // 以玩家中心为相机中心，计算可见格范围，写入state.camera
  const center = state.players.find(p => p.alive) ?? state.players[0];
  const halfW = Math.ceil(viewW / cellSize / 2);
  const halfH = Math.ceil(viewH / cellSize / 2);
  state.camera = {
    x: clamp(center.x - halfW, 0, state.map.width),
    y: clamp(center.y - halfH, 0, state.map.height),
    width: halfW * 2,
    height: halfH * 2,
  };
}

// 判断实体是否在可视区内（屏外则不tick其逻辑/不渲染）
export function isVisible(state: GameState, x: number, y: number): boolean {
  const c = state.camera;
  return x >= c.x && x < c.x + c.width && y >= c.y && y < c.y + c.height;
}
```

---

## 7. 数值常量表（shared/constants.ts，默认值，可调）

```typescript
export const TUNING = {
  tickRate: 60,

  // ── 地图 ──
  map: {
    defaultWidth: 15,
    defaultHeight: 13,
    borderThickness: 1,          // 外圈硬墙
    softWallDensity: 0.75,        // 内部软墙填充概率
    explosionDurationTicks: 30,   // 水柱显示0.5s
  },

  // ── 玩家移动 ──
  player: {
    baseSpeed: 3.0,              // 格/秒
    speedStep: 0.5,              // 每级速度道具增量
    maxSpeed: 5.5,
    trapDurationTicks: 600,      // 泡封10秒
    trapReleaseChance: 0.5,      // 每次受击泡封成功率（失败则死亡）
  },

  // ── 泡泡/爆炸 ──
  bomb: {
    defaultRange: 1,             // 初始爆炸半径（格）
    rangeStep: 1,                // 每级威力+1
    maxRange: 6,
    defaultMaxBombs: 1,          // 初始可放泡泡数
    maxBombsStep: 1,
    maxMaxBombs: 6,
    fuseTicks: 180,              // 引信3秒
    kickRange: 1,                // 踢泡推动距离
  },

  // ── 道具 ──
  powerUp: {
    dropChance: 0.35,            // 炸掉软墙掉道具概率
    // 掉落权重（合计100）
    dropWeights: { SPEED: 25, BOMB_COUNT: 25, BOMB_RANGE: 20, KICK: 10, SHIELD: 10, INVINCIBLE: 10 },
    pickupRadius: 0.6,           // 与道具中心距离<0.6格即拾取
    shieldDurationTicks: 300,    // 护盾5秒
    invincibleDurationTicks: 300,
  },

  // ── 关卡 ──
  level: {
    timeLimitTicks: 18000,       // 每关默认300秒
    enemiesBase: 1,              // 每关敌人基础数量
    enemiesPerLevel: 0.5,        // 每关+0.5个
    maxEnemies: 5,
  },

  // ── AI ──
  ai: {
    easy:   { escapeChance: 0.15, aggressiveness: 0.1 },
    normal: { escapeChance: 0.40, aggressiveness: 0.5 },
    hard:   { escapeChance: 0.75, aggressiveness: 0.9 },
  },

  // ── 性能 ──
  perf: {
    particleBudget: 200,        // 粒子上限
    maxEntitiesForFullFx: 50,   // 超过此实体数降级特效（LOD）
    cullPadding: 1,             // 可视区外扩1格再剔除
  },
} as const;
```

---

## 8. 种子化 RNG（infrastructure/seed-rng.ts）

```typescript
// Mulberry32 —— 快速、确定、可复现
export class SeedRNG {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {                       // [0,1)
    this.s |= 0; this.s = (this.s + 0x6D2B79F5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
  chance(p: number): boolean { return this.next() < p; }
}
```

**种子来源**：`Date.now()` 仅用于"新游戏"，游戏内所有随机（道具掉落、AI决策）必须用**每玩家独立种子**，保证可复现、可调试、可重放。

---

## 9. 输入系统（presentation/input）

### 键盘映射

| 玩家 | 移动 | 放泡 |
|---|---|---|
| P1（默认） | W/A/S/D | 空格 |
| P2 | 方向键 | Enter |
| 暂停 | Esc / P | — |

### 触控（移动端）

- **左下角**：方向虚拟摇杆（4向输出，死区 10px），支持多点触摸不干扰
- **右下角**：放泡大按钮（≥48×48px 热区，按下有视觉反馈）
- **拖动屏幕**：移动端允许拖动移动相机（可选，初期可先固定单屏地图）

### 统一输出

所有输入源最终只产出 `InputIntent[]`（每个活着的玩家最多一条），由 `inputRouter.poll()` 返回，交给 game-loop。

```typescript
export interface InputRouter {
  poll(): InputIntent[];      // 返回本帧所有玩家的意图（合并去重）
  setMode(mode: 'keyboard' | 'touch' | 'both'): void;
  destroy(): void;            // 解绑所有事件监听
}
```

---

## 10. 表现层：Canvas 2D 程序化绘制（不加载任何图片/音频）

所有图形用 Canvas 2D API **程序化绘制**，零图片资源，天然适配单文件构建。

### 渲染层次（后绘制的在上层）

```
1. 清屏（场景背景色）
2. 地图瓦片（硬墙/软墙/空地）—— 仅绘可视区，用clip限制
3. 道具（藏在软墙后的需先绘软墙半透明，再绘道具）
4. 泡泡（脉动缩放动画）
5. 玩家（Q版圆身+眼睛+方向指示）
6. 爆炸水柱（从中心向外扩张的方形火舌+粒子）
7. 粒子（碎片、飘字）
8. HUD（生命、道具栏、倒计时、分数）—— DOM或Canvas均可，建议DOM用CSS动画更流畅
9. 屏幕震动（canvas整体translate，≤2px）
```

### 程序化角色示例（entity-renderer.ts 核心思路）

```typescript
// 不加载贴图，纯形状绘制Q版角色
function drawPlayer(ctx, p: Player, cs: number) {
  const cx = p.x * cs + cs / 2, cy = p.y * cs + cs / 2;
  const r = cs * 0.35;
  // 身体：圆 + 描边（表现层只读p.color）
  ctx.fillStyle = p.color; ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // 眼睛：两个白圆+黑点，根据direction微移
  const ex = dirOffsetX(p.direction) * r * 0.3;
  // ...绘制眼睛、腮红（泡封时用半透明泡泡罩住）
  // 护盾时绘制旋转光圈，无敌时闪烁（alpha振荡）
}
```

### 事件驱动表现

逻辑层在关键时刻 `eventBus.emit(event)`，渲染层订阅：

| 事件 | 表现 |
|---|---|
| `explosion:start` | 水柱生成 + 粒子爆发 + 屏幕震动 + 合成音效 |
| `player:hit` | 泡封泡泡罩动画 + 受击音 |
| `powerup:pickup` | 道具飞入HUD + 得分飘字 + 音效 |
| `level:clear` | 胜利音 + 粒子彩带 |
| `game:over` | 失败音 + 黑屏渐入 |

---

## 11. 存档（infrastructure/indexed-db-storage.ts）

```typescript
export class IndexedDbStorage implements StorageService {
  private db: IDBDatabase;
  async init(): Promise<void> { /* open db 'bubble-war', store 'save' */ }
  async save(key: string, data: unknown): Promise<void> { /* put */ }
  async load<T>(key: string): Promise<T | null> { /* get，不存在返回null */ }
  async remove(key: string): Promise<void> { /* delete */ }
}
// 存档内容：最高分、解锁进度、设置（音量/键位/难度偏好）
```

---

## 12. 性能优化清单（工程要求）

| 措施 | 实现位置 | 说明 |
|---|---|---|
| 屏外休眠 | camera-system + 各system循环 | `isVisible()` 判断，不可见实体跳过逻辑tick |
| 渲染裁剪 | main-renderer | `ctx.save(); ctx.rect(viewport); ctx.clip();` 只绘可视区 |
| LOD降级 | particle-renderer | 实体数 > 阈值时，粒子数×0.5、关闭非必要特效 |
| 对象池 | bomb/explosion/particle | 复用对象，避免运行时GC抖动 |
| 无深拷贝 | game-loop + systems | tick中直接改state字段；rules层返回新对象但输入体积小 |
| 固定步长 | game-loop | accumulator模式，逻辑帧率恒定60Hz |
| 触发热区 | touch-input | 按钮≥48px，摇杆死区10px，preventDefault防滚动 |
| 单文件内联 | vite.config | vite-plugin-singlefile + assetsInlineLimit |

---

## 13. 移动端适配

- **横屏强制**：CSS `@media (orientation: portrait)` 显示"请旋转设备"遮罩；尝试 `screen.orientation.lock('landscape')`（部分浏览器需用户手势触发）。
- **视口自适应**：监听 `resize`/`orientationchange`，重算 `cellSize = min(innerWidth/mapW, innerHeight/mapH)`，地图居中。
- **安全区**：`env(safe-area-inset-*)` 适配刘海屏，虚拟按键避开边缘安全区。
- **防误触**：`touch-action: none` 禁用默认手势；按钮点击间隔≥300ms去抖；禁用双击缩放（`user-scalable=no`）。

---

## 14. 构建配置（vite.config.ts 关键片段）

```typescript
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import singlefile from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [singlefile() as Plugin],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100 * 1024 * 1024, // 100MB内全部内联→单文件
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4096,
  },
  test: {
    environment: 'node',          // 逻辑层单测跑node环境（无DOM）
    include: ['src/test/**/*.test.ts'],
  },
});
```

`package.json` 脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "vite": "^5.2",
    "vite-plugin-singlefile": "^2.0",
    "vitest": "^1.5"
  }
}
```

---

## 15. 实施里程碑（P0 ~ P5）

| 阶段 | 目标 | 验收标准 | 对应单测 |
|---|---|---|---|
| **P0 骨架** | 项目搭建、共享类型、空游戏循环、Canvas清屏、横屏自适应 | `tsc --noEmit` 零错误，`npm run build` 产出单文件，`npm run dev` 见彩色画布 | types/event-bus 基础测试 |
| **P1 移动** | 地图生成（种子化）、玩家移动（键盘）、碰撞检测、相机可视区 | 单人可在网格上流畅移动，撞墙不动，屏外休眠生效 | movement.test.ts（边界/墙/泡泡） |
| **P2 炸弹** | 放泡、引信倒计时、十字水柱、软墙摧毁、连锁爆炸、道具掉落 | 放泡→3秒后爆炸→炸墙→概率掉道具→可拾取生效 | bomb.test.ts（水柱计算/连锁/墙阻挡）、powerup.test.ts |
| **P3 对战** | AI（三难度BFS寻路+放泡）、双人模式、虚拟按键、泡封/营救 | 双人或人机可对战，AI会躲爆炸会放泡，泡封可营救 | ai.test.ts（困难AI安全格判断）、damage.test.ts |
| **P4 完整** | 关卡系统、计分、菜单/设置/结算DOM UI、IndexedDB存档、事件驱动粒子+音效 | 完整游戏循环：菜单→选关→游玩→结算→存档→继续 | 全量单测通过，存档读写测试 |
| **P5 打磨** | 特效LOD降级、平衡调参、移动端横屏+虚拟键全链路、性能profile | 移动端60FPS、单文件<2MB、调参后手感接近原版 | perf相关单测（粒子预算/可视区计算） |

---

## 16. 单测规范（每规则文件必须有对应 test/）

- **测试环境**：`node`（逻辑层不依赖DOM）。
- **固定种子**：每个 test 用 `new SeedRNG(12345)` 保证可复现。
- **覆盖**：正常路径 + 边界（地图边缘、满泡泡、最大爆炸半径穿墙） + 负向（撞墙不动、泡泡不可穿过、连锁不无限递归）。
- **禁止**：测试中 `import` 表现层；禁止在rules层测试里操作`window`。

```typescript
// 示例：test/bomb.test.ts（节选）
import { describe, it, expect } from 'vitest';
import { computeExplosionCells } from '../src/core/rules/bomb';
import { TileType } from '../src/shared/types';
import { TUNING } from '../src/shared/constants';

describe('computeExplosionCells', () => {
  it('炸弹中心始终在结果中', () => {
    const map = fakeMap(5, 5); // 辅助函数造一张空地图
    const cells = computeExplosionCells(2, 2, 1, map);
    expect(cells).toContainEqual({ x: 2, y: 2 });
  });
  it('硬墙完全阻挡爆炸', () => {
    const map = fakeMap(5, 5);
    map.cells[2][4].type = TileType.WALL; // 右数第2格放墙
    const cells = computeExplosionCells(2, 2, 3, map);
    expect(cells.some(c => c.x === 4 && c.y === 2)).toBe(false);
  });
  it('软墙被包含但不延伸', () => {
    const map = fakeMap(5, 5);
    map.cells[2][3].type = TileType.SOFT; // 右数第1格是软墙
    const cells = computeExplosionCells(2, 2, 3, map);
    expect(cells.some(c => c.x === 3 && c.y === 2)).toBe(true);  // 软墙格本身被炸
    expect(cells.some(c => c.x === 4 && c.y === 2)).toBe(false); // 但不继续延伸
  });
});
```

---

## 17. 版权与合规声明

- 游戏名、角色形象、场景美术、音乐音效**全部原创**，规避"泡泡堂"IP 侵权风险。
- 玩法机制（放泡、十字爆炸、道具、胜负规则）属思想范畴，可借鉴；具体表达需原创。
- 本代码设计文档与 GDD、美术文档共同构成复刻规格书，供开发团队/AI 工具内部使用。
</content>
</invoke>
