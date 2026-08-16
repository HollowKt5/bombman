/**
 * shared/constants.ts —— 数值常量表（数据驱动，加内容不改核心循环）
 * 与《代码设计文档》第 7 章对应；config.ts 的 JSON 结构在 v1 合并于此。
 */
import {
  Difficulty,
  PowerUpType,
  type DifficultyConfig,
  type ThemeSpec,
} from './types';

export const TUNING = {
  tickRate: 60,

  // ── 地图 ──
  map: {
    defaultWidth: 15,
    defaultHeight: 13,
    borderThickness: 1, // 外圈硬墙
    softWallDensity: 0.7, // 内部软墙填充概率（具体难度见 DIFFICULTY）
  },

  // ── 玩家 ──
  player: {
    baseSpeed: 3.0, // 格/秒
    speedStep: 0.3, // 速度靴单次加成（保留字段）
    maxSpeed: 5, // 速度上限 5（v1.4.7 调低）
    baseHp: 3, // 初始生命
    maxHp: 5,
    spawnInvincibleTicks: 120, // 出生安全时间 2s
    hitInvincibleTicks: 120, // 受伤无敌 2s
    trapDurationTicks: 300, // 泡封 5s
    bombCooldownTicks: 18, // 放泡冷却 0.3s
    mountSpeedFactor: 0.9, // 恐龙坐骑：移速 ×0.9
    mountChargeTicks: 30, // 按住方向 0.5s 充能后才开始破墙（不自动破）
    mountBreakTicks: 90, // 破墙过程 1.5s
  },

  // ── 敌人掉落（炸死敌人掉他吃过的道具） ──
  enemyLoot: {
    eatenChance: 0.6, // 吃过的道具掉落概率
    notEatenChance: 0.08, // 没吃过的道具小概率掉落
    rainbowDurationTicks: 1200, // 彩虹持续 20s
  },

  // ── 泡泡 / 爆炸 ──
  bomb: {
    defaultRange: 1, // 初始爆炸半径（格）
    rangeStep: 1,
    maxRange: 4, // 威力上限 4（v1.4.9 调低）
    defaultMaxBombs: 1,
    maxMaxBombs: 6, // 最多可放 6 个泡泡
    fuseTicks: 150, // 引信 2.5s
    explosionDurationTicks: 30, // 水柱持续 0.5s
    kickTicks: 8, // 踢泡：每格滑动用时（tick）→ 约 7.5 格/秒，有过程感
  },

  // ── 道具 ──
  powerUp: {
    scorePerPickup: 50,
  },

  // ── 计分 ──
  score: {
    block: 10,
    kill: 500,
    timePerSecond: 5,
  },

  // ── 关卡 ──
  level: {
    maxLevel: 5,
    enemiesTable: [1, 2, 2, 3, 3], // 每关敌人数量（v1 共 5 关）
  },

  // ── AI ──
  ai: {
    replanTicks: 30, // 每 0.5s 重新寻路
  },
} as const;

/** 难度表（数据驱动：AI 参数 / 速度 / 软墙密度 / 时限；v1.5.7 每局时长统一 5 分钟） */
export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  [Difficulty.EASY]: {
    escapeChance: 0.15,
    aggressiveness: 0.1,
    placeBombChance: 0.02,
    speed: 2.5,
    softWallDensity: 0.5,
    timeLimitTicks: 300 * 60, // 5 分钟
  },
  [Difficulty.NORMAL]: {
    escapeChance: 0.4,
    aggressiveness: 0.5,
    placeBombChance: 0.05,
    speed: 3.0,
    softWallDensity: 0.65,
    timeLimitTicks: 300 * 60, // 5 分钟
  },
  [Difficulty.HARD]: {
    escapeChance: 0.75,
    aggressiveness: 0.9,
    placeBombChance: 0.08,
    speed: 3.5,
    softWallDensity: 0.75,
    timeLimitTicks: 300 * 60, // 5 分钟
  },
};

/** 五大主题场景（美术文档第 3 章调色板） */
export const THEMES: ThemeSpec[] = [
  {
    id: 'forest',
    name: '果园',
    floor: '#6AB150',
    floorAlt: '#5FA346',
    wall: '#5A3A1A',
    wallLight: '#7A5230',
    block: '#C9A227',
    blockLight: '#E0B93E',
    accent: '#3E7C2F',
    bg: '#8BC97E',
  },
  {
    id: 'beach',
    name: '沙滩',
    floor: '#F4D58D',
    floorAlt: '#E8C87C',
    wall: '#8B6914',
    wallLight: '#A8862A',
    block: '#B8860B',
    blockLight: '#D4A017',
    accent: '#4FA3B8',
    bg: '#A8DCE8',
  },
  {
    id: 'candy',
    name: '糖果屋',
    floor: '#FFB6C1',
    floorAlt: '#F8A5B2',
    wall: '#FF69B4',
    wallLight: '#FF85C2',
    block: '#FFD700',
    blockLight: '#FFE14D',
    accent: '#E040FB',
    bg: '#FFD0E0',
  },
  {
    id: 'snow',
    name: '雪原',
    floor: '#E0F7FA',
    floorAlt: '#D0ECF2',
    wall: '#90A4AE',
    wallLight: '#AEBFC7',
    block: '#B0BEC5',
    blockLight: '#C9D4DA',
    accent: '#4FC3F7',
    bg: '#EAF6FA',
  },
  {
    id: 'night',
    name: '夜市',
    floor: '#2C2C54',
    floorAlt: '#25254A',
    wall: '#1A1A3E',
    wallLight: '#2C2C5C',
    block: '#FF6B6B',
    blockLight: '#FF8A80',
    accent: '#FFD54F',
    bg: '#3A3A66',
  },
];

/** 道具视觉元数据 */
export const POWERUP_META: Record<
  PowerUpType,
  { emoji: string; color: string; label: string }
> = {
  [PowerUpType.BOMB_COUNT]: { emoji: '💣', color: '#FF3D00', label: '炸弹·可用数+1' },
  [PowerUpType.BOMB_RANGE]: { emoji: '🧪', color: '#FF6D00', label: '爆炸药·威力+1' },
  [PowerUpType.SPEED]: { emoji: '👟', color: '#00CED1', label: '疾跑鞋·移速+15%' },
  [PowerUpType.KICK]: { emoji: '🧤', color: '#8B4513', label: '踢泡手套' },
  [PowerUpType.HEART]: { emoji: '❤️', color: '#FF69B4', label: '回血+1' },
  [PowerUpType.MOUNT]: { emoji: '🦖', color: '#7CB342', label: '恐龙坐骑·顶开软墙' },
  [PowerUpType.RAINBOW]: { emoji: '🌈', color: '#7C4DFF', label: '彩虹光波·碰者掉血' },
};

/**
 * 炸毁软方块后的掉落表（含"无道具"，权重合计 100）。
 * v1.4.5：恐龙出现概率降低 2%→1%。
 * 55% 无 / 7% 🧪爆炸药 / 10% 💣炸弹 / 13% 👟鞋 / 7% 🧤手套 / 7% ❤️心 / 1% 🦖坐骑
 * 权重可在此调整（数据驱动）。
 */
export const BLOCK_DROP_TABLE: Array<[PowerUpType | null, number]> = [
  [null, 54.99], // 无道具（彩虹概率降至 0.01% 后并入）
  [PowerUpType.BOMB_RANGE, 2], // 爆炸药：威力 +1（概率降低）
  [PowerUpType.BOMB_COUNT, 15], // 炸弹：可用数 +1（概率增加）
  [PowerUpType.SPEED, 13], // 疾跑鞋：移速 +8%
  [PowerUpType.KICK, 7], // 手套：可踢泡
  [PowerUpType.HEART, 7], // 心：回血 +1
  [PowerUpType.MOUNT, 1], // 恐龙坐骑：1%
  [PowerUpType.RAINBOW, 0.01], // 彩虹光波：0.01%（极稀有，期间无敌）
];

/**
 * AI 炸软块掉落表（用户规格 v1.5.7，**仅针对 AI**）：坐骑 -2/3、无敌(彩虹) -1/2、
 * 靴子(疾跑鞋) -2/3、其它（爆炸药/炸弹/手套/心）各 -1/2；差额并入"无道具"。
 * 玩家炸软块仍用 BLOCK_DROP_TABLE（不缩水）。
 */
export const BLOCK_DROP_TABLE_AI: Array<[PowerUpType | null, number]> = [
  [null, 79.83], // 无道具（吸收差额，AI 掉道具概率整体更低）
  [PowerUpType.BOMB_RANGE, 1], // 爆炸药 ×1/2
  [PowerUpType.BOMB_COUNT, 7.5], // 炸弹 ×1/2
  [PowerUpType.SPEED, 4.33], // 疾跑鞋 ×1/3（-2/3）
  [PowerUpType.KICK, 3.5], // 手套 ×1/2
  [PowerUpType.HEART, 3.5], // 心 ×1/2
  [PowerUpType.MOUNT, 0.33], // 恐龙坐骑 ×1/3（-2/3）
  [PowerUpType.RAINBOW, 0.005], // 彩虹光波/无敌 ×1/2
];


/** 玩家 / 敌人配色（美术文档 9.2 角色调色板，原创替代） */
export const PLAYER_COLORS = {
  hero: '#4285F4',
  enemy: ['#9C27B0', '#F44336', '#4CAF50', '#FF80AB', '#FFCA28'],
};
