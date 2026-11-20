import type {
  CardinalDir,
  DamageType,
  FloatTextTone,
  LogTone,
  PropKind,
  Rarity,
  StatusTag,
  SurfaceKind,
  TileKind,
  UnitKind,
} from './viewModel.ts';

export interface GlyphSpec {
  char: string;
  color: string;
  glow?: string;
  bold?: boolean;
  label: string;
  desc: string;
}

export interface SurfaceStyle {
  bg: string;
  accent: string;
  patternChar?: string;
  label: string;
  tags: string[];
  desc: string;
}

export interface StatusBadgeSpec {
  code: string;
  color: string;
  bg: string;
  label: string;
  desc: string;
}

/**
 * Caves-inspired low-saturation dark floor palette + crisp high-contrast cyber foregrounds.
 * All ASCII glyphs and colors live exclusively inside `src/render/` so core logic stays 100% decoupled.
 */
export const PALETTE = {
  bgVoid: '#07090d',
  bgUnexplored: '#0b0e14',
  bgUnexploredStripe: 'rgba(130, 155, 190, 0.045)',
  floorEven: '#131822',
  floorOdd: '#151b26',
  floorExploredDim: '#10141c',
  wallBg: '#1c2330',
  wallTop: '#2a3548',
  wallChar: '#4b5a73',
  cornerBracket: 'rgba(182, 212, 245, 0.16)',
  cornerBracketHover: 'rgba(120, 232, 255, 0.72)',
  electrifiedOverlay: 'rgba(0, 229, 255, 0.24)',
  electrifiedArc: '#5ef2ff',
  intentFill: 'rgba(255, 68, 86, 0.16)',
  intentStroke: '#ff4b5c',
  intentDisabledFill: 'rgba(130, 140, 155, 0.10)',
  intentDisabledStroke: 'rgba(165, 178, 196, 0.42)',
  intentLootWarn: '#ffb238',
  dimMask: 'rgba(5, 8, 13, 0.56)',
  previewMove: '#5be4ff',
  previewMoveBlocked: '#ff5c6c',
  previewKinetic: '#ffb238',
  previewSever: '#ff70a6',
  previewElectro: '#3ef2ff',
  previewHack: '#50fa9b',
  previewThrow: '#c89bff',
} as const;

export const TILE_GLYPHS: Record<TileKind, GlyphSpec> = {
  void: {
    char: ' ',
    color: '#07090d',
    label: '虚空',
    desc: '房间外部边界',
  },
  floor: {
    char: '·',
    color: 'rgba(160, 185, 215, 0.14)',
    label: '金属地板',
    desc: '标准可通行地板',
  },
  wall: {
    char: '#',
    color: '#4c5c77',
    bold: true,
    label: '合金隔墙',
    desc: '阻挡移动、视线与射线，撞击造成 1 点碰撞伤害',
  },
  door_closed: {
    char: '+',
    color: '#f2b84b',
    glow: 'rgba(242, 184, 75, 0.45)',
    bold: true,
    label: '封闭防爆门',
    desc: '消耗 1 AP 破门揭示相邻房间并唤醒内部敌人',
  },
  door_open: {
    char: '/',
    color: '#637694',
    label: '已开启门洞',
    desc: '可自由穿行与传递射线',
  },
  elevator: {
    char: '>',
    color: '#47f59d',
    glow: 'rgba(71, 245, 157, 0.55)',
    bold: true,
    label: '撤离电梯',
    desc: '1 AP 启动：无激活敌人立即撤离，否则坚守 1 回合',
  },
};

export const SURFACE_STYLES: Record<SurfaceKind, SurfaceStyle> = {
  none: {
    bg: 'transparent',
    accent: 'transparent',
    label: '干燥地板',
    tags: [],
    desc: '无特殊地表效果',
  },
  water: {
    bg: '#112a46',
    accent: 'rgba(84, 184, 255, 0.42)',
    patternChar: '~',
    label: '积水',
    tags: ['Conductive', 'Wet'],
    desc: '四邻域传导电流；遇极寒结冰，遇火灭火',
  },
  ice: {
    bg: '#193f4f',
    accent: 'rgba(138, 240, 255, 0.48)',
    patternChar: '≡',
    label: '冰面',
    tags: ['ZeroFriction', 'Cryo'],
    desc: '被击退进入冰面将沿冰持续滑行直至撞击或滑出；遇火化水',
  },
  oil: {
    bg: '#2a2016',
    accent: 'rgba(186, 134, 72, 0.36)',
    patternChar: '≈',
    label: '易燃油污',
    tags: ['Flammable'],
    desc: '遇火或爆炸引燃，并每回合向相邻油污蔓延',
  },
  fire: {
    bg: '#401618',
    accent: 'rgba(255, 118, 54, 0.65)',
    patternChar: '^',
    label: '燃烧烈焰',
    tags: ['Thermal', 'Hazard'],
    desc: '站在火上每回合受 1 伤并升温；持续 3 回合熄灭',
  },
};

export const UNIT_GLYPHS: Record<UnitKind, GlyphSpec> = {
  player: {
    char: '@',
    color: '#ffe27a',
    glow: 'rgba(255, 226, 122, 0.65)',
    bold: true,
    label: '玩家机甲',
    desc: '你的可改装赛博义体',
  },
  grunt: {
    char: 'g',
    color: '#ff6e76',
    bold: true,
    label: '安保步兵',
    desc: '近/中距均衡单位，适合练习精准斩臂与击退',
  },
  enforcer: {
    char: 'E',
    color: '#ff8744',
    glow: 'rgba(255, 135, 68, 0.35)',
    bold: true,
    label: '履带执法者',
    desc: '重型防击退、高伤直线火力压制，右臂常携带高价值武器',
  },
  drone: {
    char: 'd',
    color: '#88d4ff',
    glow: 'rgba(136, 212, 255, 0.35)',
    bold: true,
    label: '侦查无人机',
    desc: '高机动、带 [PrecisionCircuit]/[OpticSensor]，受导电增伤',
  },
  hacker: {
    char: 'h',
    color: '#e57aff',
    glow: 'rgba(229, 122, 255, 0.35)',
    bold: true,
    label: '企业骇客',
    desc: '带 [OpticSensor]，远程电子干扰与升温压制',
  },
  sentry: {
    char: 'S',
    color: '#ffd147',
    glow: 'rgba(255, 209, 71, 0.32)',
    bold: true,
    label: '固定哨戒炮',
    desc: '固定位置高火力直线射界，极适合黑客 90° 偏转或推敌挡枪',
  },
};

export const PROP_GLYPHS: Record<PropKind, GlyphSpec> = {
  cooling_pipe: {
    char: '║',
    color: '#79ecff',
    glow: 'rgba(121, 236, 255, 0.45)',
    bold: true,
    label: '液氮冷却管',
    desc: '受击或被撞击时爆裂，周围 3×3 结冰并降温',
  },
  power_box: {
    char: '⊞',
    color: '#ffe45e',
    glow: 'rgba(255, 228, 94, 0.4)',
    bold: true,
    label: '高压配电箱',
    desc: '带 [Conductive]，受击破坏时向连通导电网络释放脉冲电弧',
  },
  explosive_barrel: {
    char: '◎',
    color: '#ff6448',
    glow: 'rgba(255, 100, 72, 0.42)',
    bold: true,
    label: '高爆燃料桶',
    desc: '引爆对 3×3 造成范围伤害、向外击退 1 格并点燃地表',
  },
  heavy_crate: {
    char: '■',
    color: '#8ea0b8',
    bold: true,
    label: '重型货箱',
    desc: '[HeavyBlocker, Conductive] 阻挡通行与射线，撞击额外眩晕 1 回合',
  },
  cargo_pod: {
    char: '▣',
    color: '#6ec4db',
    bold: true,
    label: '部署货舱',
    desc: '玩家投掷的背部货舱，兼具导电桥接与阻挡射线/撞击眩晕功能',
  },
  dropped_part: {
    char: '%',
    color: '#d8e3f2',
    bold: true,
    label: '斩落义体 / 战利品',
    desc: '[Conductive, Item] 不阻挡通行；可导电桥接，遭敌火命中会损毁',
  },
};

export const RARITY_COLORS: Record<Rarity, { fg: string; border: string; glow?: string; label: string }> = {
  common: {
    fg: '#cfd9e6',
    border: '#5a6b82',
    label: '制式',
  },
  rare: {
    fg: '#5cd6ff',
    border: '#37a9dc',
    glow: 'rgba(92, 214, 255, 0.38)',
    label: '精良',
  },
  legendary: {
    fg: '#ffab36',
    border: '#ff9624',
    glow: 'rgba(255, 171, 54, 0.62)',
    label: '传奇橙装',
  },
};

export const STATUS_BADGES: Record<StatusTag, StatusBadgeSpec> = {
  stunned: {
    code: '⚡',
    color: '#0c1017',
    bg: '#ffe14d',
    label: '眩晕',
    desc: '跳过本回合动作，已亮出的攻击意图立即失效',
  },
  overheated: {
    code: '▲',
    color: '#0c1017',
    bg: '#ff9436',
    label: '过热 (41~79)',
    desc: '处于过热区间；带病毒部件存在故障自损风险',
  },
  redline: {
    code: '‼',
    color: '#ffffff',
    bg: '#ff3850',
    label: '红温 (80~99)',
    desc: '每回合向脚下与相邻导电格放电并自损 1 点（自身免疫电弧眩晕）',
  },
  virus: {
    code: '☣',
    color: '#0c1017',
    bg: '#7dff6b',
    label: '病毒词条',
    desc: '每次触发额外 +10 热量，过热/受电击时可能自损耐久',
  },
  dormant: {
    code: 'z',
    color: '#8e9db5',
    bg: '#1c2330',
    label: '休眠',
    desc: '未破门房间内保持休眠，破门后激活并立即亮出首轮意图',
  },
};

export const DIR_ARROWS: Record<CardinalDir, string> = {
  N: '↑',
  E: '→',
  S: '↓',
  W: '←',
};

export const DIR_VECTORS: Record<CardinalDir, { x: number; y: number }> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export const DAMAGE_TYPE_META: Record<
  DamageType,
  { label: string; color: string; integrityPct?: number }
> = {
  kinetic: { label: '动能', color: '#ffb238', integrityPct: 50 },
  slash: { label: '斩击', color: '#ff70a6', integrityPct: 90 },
  electro: { label: '电击/EMP', color: '#47f0ff', integrityPct: 85 },
  thermal: { label: '高热', color: '#ff6448', integrityPct: 40 },
  cryo: { label: '极寒', color: '#79ecff', integrityPct: 80 },
  hack: { label: '黑客', color: '#50fa9b' },
  explosive: { label: '爆炸', color: '#ff4b5c', integrityPct: 10 },
};

export const FLOAT_TONE_COLORS: Record<FloatTextTone, string> = {
  damage: '#ff6470',
  stun: '#ffe14d',
  disarm: '#ff78b4',
  overheat: '#ff8a3d',
  cryo: '#87f2ff',
  electro: '#4cf3ff',
  hack: '#54fa9f',
  loot: '#ffb443',
};

export const LOG_TONE_COLORS: Record<LogTone, string> = {
  system: '#9fb2cc',
  kinetic: '#ffc05c',
  cryo: '#7deeff',
  electro: '#4cf3ff',
  thermal: '#ff7d57',
  hack: '#5ef2a5',
  loot: '#ffae3d',
  danger: '#ff5c6e',
};
