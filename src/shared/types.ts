/**
 * shared/types.ts —— 所有领域接口（interface）+ 枚举
 * 本层无任何依赖，且不得引用浏览器 API。
 */

/** 地形类型 */
export enum TileType {
  EMPTY = 0, // 空地
  WALL = 1, // 硬墙（不可破坏）
  SOFT = 2, // 软方块（可炸毁）
}

/** 方向 */
export enum Direction {
  UP = 0,
  DOWN = 1,
  LEFT = 2,
  RIGHT = 3,
  NONE = 4,
}

/** 道具类型（v1.4：炸弹可用数 / 爆炸药威力 / 疾跑鞋 / 手套 / 心 / 恐龙坐骑） */
export enum PowerUpType {
  SPEED = 0,
  BOMB_COUNT = 1, // 💣 炸弹：可用炸弹数 +1
  BOMB_RANGE = 2, // 🧪 爆炸药：爆炸格子 +1（四方向）
  KICK = 3,
  HEART = 4,
  MOUNT = 5, // 🦖 恐龙坐骑：顶开软墙，移速 -10%
  RAINBOW = 6, // 🌈 彩虹光波：身体覆彩虹，碰到的人物掉 1 格命，移速 +10%
}

/** 游戏阶段 */
export enum GamePhase {
  MENU = 0,
  PLAYING = 1,
  PAUSED = 2,
  VICTORY = 3,
  DEFEAT = 4,
}

/** 难度 */
export enum Difficulty {
  EASY = 0,
  NORMAL = 1,
  HARD = 2,
}

/** 格子数据 */
export interface CellData {
  type: TileType;
  /** 软方块内隐藏的道具（生成时决定，炸毁时掉落） */
  hiddenPowerUp: PowerUpType | null;
}

/** 地图数据 */
export interface MapData {
  width: number;
  height: number;
  cells: CellData[][]; // [y][x]
  theme: string; // 场景主题 id
}

/** 玩家 / 敌人（逻辑层用浮点格子坐标） */
export interface Player {
  id: number;
  x: number; // 浮点格子坐标（渲染时 × 格宽）
  y: number;
  facing: Direction;
  speed: number; // 格/秒（受道具影响）
  baseSpeed: number;
  bombRange: number; // 爆炸半径（格）
  maxBombs: number; // 可同时放置泡泡数
  alive: boolean;
  trapped: boolean; // 泡封中
  trapTimer: number; // 剩余 tick
  /** 泡封挣脱进度：已按过的不同方向（上下左右各按一遍即可提前突破） */
  trapDirs: Direction[];
  invincibleTimer: number; // 无敌剩余 tick（出生保护/受伤保护）
  kick: boolean; // 手套（推泡）
  mount: boolean; // 恐龙坐骑（可抵一次伤害后消失；按住方向键可顶开软墙）
  rainbow: boolean; // 彩虹光波（极稀有 0.01%；期间无敌，碰到的人物掉 1 格命，移速 +10%）
  /** 彩虹剩余 tick（20s 后消失） */
  rainbowTimer: number;
  /** 该角色吃过的道具（死亡掉落用：吃过的掉率高、没吃的小概率掉、没吃任何东西不掉） */
  eaten: PowerUpType[];
  /**
   * 坐骑破墙状态：charge = 按住方向 0.5s 充能（松开取消）；hit = 破墙过程 1.5s（完成才顶开）
   */
  break: { x: number; y: number; t: number; phase: 'charge' | 'hit' } | null;
  bombCooldown: number; // 放泡冷却 tick
  hp: number;
  maxHp: number;
  score: number;
  blocksBroken: number;
  kills: number;
  powerupsTaken: number;
  isHuman: boolean;
  color: string;
  rngSeed: number; // 每玩家独立种子（AI 随机可复现）
  lastDir: Direction;
}

/** 泡泡（炸弹） */
export interface Bomb {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  timer: number; // 剩余 tick（到 0 引爆）
  range: number;
  exploded: boolean;
  /** 踢泡：正在推进的方向（null = 静止） */
  kickDir: Direction | null;
  /** 踢泡推进节奏：当前格剩余滑动 tick */
  kickT: number;
  /** 踢泡滑动动画（渲染插值用；逻辑格已即时更新） */
  kickSlide: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    remaining: number;
  } | null;
}

/** 爆炸水柱 */
export interface Explosion {
  id: number;
  ownerId: number;
  cells: Array<{ x: number; y: number }>;
  remaining: number; // 剩余显示 tick
  total: number;
  hitIds: number[]; // 已结算伤害的实体 id（防止同一爆炸重复扣血）
}

/** 道具实体 */
export interface PowerUp {
  id: number;
  x: number;
  y: number;
  type: PowerUpType;
}

/** 粒子 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
}

/** 输入意图（表现层 → 逻辑层，纯数据） */
export interface InputIntent {
  playerId: number;
  direction: Direction;
  placeBomb: boolean;
}

/** 相机可视区（格坐标，v1 单屏地图 = 全图） */
export interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 游戏状态（唯一可变状态容器） */
export interface GameState {
  phase: GamePhase;
  map: MapData;
  players: Player[];
  bombs: Bomb[];
  explosions: Explosion[];
  powerUps: PowerUp[];
  particles: Particle[];
  tick: number; // 逻辑 tick 计数
  level: number; // 当前关卡（1 起）
  timeLeft: number; // 关卡倒计时 tick
  nextEntityId: number; // 自增 id 分配器
  camera: Camera;
  difficulty: Difficulty;
  rngSeed: number; // 本局种子（地图生成 / 掉落）
}

/** 难度参数（AI 行为） */
export interface DifficultyConfig {
  escapeChance: number;
  aggressiveness: number;
  placeBombChance: number;
  speed: number; // 敌人速度（格/秒）
  softWallDensity: number;
  timeLimitTicks: number;
}

/** 主题配色（表现层使用） */
export interface ThemeSpec {
  id: string;
  name: string;
  floor: string;
  floorAlt: string;
  wall: string;
  wallLight: string;
  block: string;
  blockLight: string;
  accent: string;
  bg: string;
}

/** AI 视野快照（由 ai-system 构造的只读拷贝） */
export interface AISenseSnapshot {
  self: { x: number; y: number; trapped: boolean; lastDir: Direction };
  bounds: { width: number; height: number };
  dangerCells: Set<string>; // "x,y" 危险格（爆炸覆盖 + 泡泡所在格）
  enemies: Array<{ x: number; y: number }>;
  powerUps: Array<{ x: number; y: number; type: PowerUpType }>;
  difficulty: DifficultyConfig;
  hasBombAtSelf: boolean;
  /** 可炸软墙格（AI 破墙主目标） */
  softBlocks: Array<{ x: number; y: number }>;
  /** AI 已承诺的目标墙（锁定直到被炸掉/放弃，防止反复横跳） */
  wallTarget: { x: number; y: number } | null;
  /** 该格当前是否可走（地图 + 泡泡 + 水柱障碍，ai-system 构造的只读闭包） */
  walkable: (x: number, y: number) => boolean;
  /** 计算一颗泡泡在 (x,y) 半径 range 的爆炸覆盖格（含软墙阻挡，ai-system 构造） */
  blastCells: (x: number, y: number, range: number) => Set<string>;
  /** 卡住标志（连续数 tick 未移动） */
  stuck: boolean;
  /** 上一 tick 所在格（贪心禁止回退到该格，防死胡同乒乓；绕路交给 BFS） */
  prevCell: { x: number; y: number } | null;
}

/** 逻辑 → 表现事件（渲染层订阅做动画/音效/粒子） */
export type GameEvent =
  | { type: 'bomb:placed'; x: number; y: number; ownerId: number }
  | { type: 'explosion:start'; cells: Array<{ x: number; y: number }>; ownerId: number }
  | { type: 'block:destroyed'; x: number; y: number }
  | { type: 'powerup:pickup'; x: number; y: number; powerUp: PowerUpType; playerId: number }
  | { type: 'player:hit'; playerId: number; hp: number; trapped: boolean }
  | { type: 'player:death'; playerId: number }
  | { type: 'enemy:death'; playerId: number }
  | { type: 'trap:release'; playerId: number }
  | { type: 'level:clear'; level: number }
  | { type: 'game:over'; level: number };
