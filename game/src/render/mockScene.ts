import { DIR_VECTORS } from './glyphs.ts';
import type {
  ActionSlotView,
  CardinalDir,
  CombatLogEntry,
  IntentView,
  PreviewOverlay,
  PropView,
  RenderEvent,
  RenderSnapshot,
  RoomMiniView,
  SurfaceKind,
  TileCell,
  UnitView,
  Vec2,
} from './viewModel.ts';

export type DemoId = 'ice_slide' | 'electro_bridge' | 'sever_disarm' | 'redline_enemy_turn';

const ROOM_OUTER_W = 11;
const ROOM_OUTER_H = 9;
const GRID_COLS = 3;
const GRID_ROWS = 2;
const FLOOR_W = ROOM_OUTER_W + (GRID_COLS - 1) * (ROOM_OUTER_W - 1); // 31
const FLOOR_H = ROOM_OUTER_H + (GRID_ROWS - 1) * (ROOM_OUTER_H - 1); // 17

const DEFAULT_ACTIONS: ActionSlotView[] = [
  {
    id: 'move',
    hotkey: '1',
    name: '战术移动',
    apCost: 1,
    category: 'move',
    summary: '每格 1 AP，悬停预览 A* 路径与 AP 消耗',
  },
  {
    id: 'power_fist',
    hotkey: '2',
    name: '破拳套',
    apCost: 1,
    damageType: 'kinetic',
    category: 'weapon',
    summary: '近战 2 伤 + 击退 1 格（遇冰持续滑行，动能掉率 50%）',
  },
  {
    id: 'hf_blade',
    hotkey: '3',
    name: '精准斩落',
    apCost: 2,
    heatCost: 8,
    damageType: 'slash',
    category: 'sever',
    summary: '高频刃定向攻击外挂部件，斩击完好率 90%',
  },
  {
    id: 'shock_baton',
    hotkey: '4',
    name: '电击棍',
    apCost: 2,
    heatCost: 10,
    damageType: 'electro',
    category: 'weapon',
    summary: '沿积水与 [Conductive] 实体全网传导并眩晕（EMP 85%）',
  },
  {
    id: 'data_spike',
    hotkey: '5',
    name: '数据刺偏转',
    apCost: 1,
    heatCost: 12,
    damageType: 'hack',
    category: 'hack',
    summary: '将目标意图方向旋转 90°（Q/E 切顺逆时针），实时重算射界',
  },
  {
    id: 'throw_pod',
    hotkey: '6',
    name: '投掷货舱',
    apCost: 1,
    category: 'utility',
    summary: '射程 1~3 格空地：可搭导电桥或作为 [HeavyBlocker] 挡枪',
  },
];

export function createMockSnapshot(): RenderSnapshot {
  const rooms: RoomMiniView[] = [
    {
      id: 'R1',
      code: 'R1',
      name: '入侵气闸',
      gridX: 0,
      gridY: 0,
      x: 0,
      y: 0,
      w: ROOM_OUTER_W,
      h: ROOM_OUTER_H,
      state: 'explored',
      connectedTo: ['R2', 'R4'],
      hasEnemies: false,
      hasElevator: false,
    },
    {
      id: 'R2',
      code: 'R2',
      name: '冷却配电间',
      gridX: 1,
      gridY: 0,
      x: 10,
      y: 0,
      w: ROOM_OUTER_W,
      h: ROOM_OUTER_H,
      state: 'current',
      connectedTo: ['R1', 'R3', 'R5'],
      hasEnemies: true,
      hasElevator: false,
    },
    {
      id: 'R3',
      code: 'R3',
      name: '企业金库',
      gridX: 2,
      gridY: 0,
      x: 20,
      y: 0,
      w: ROOM_OUTER_W,
      h: ROOM_OUTER_H,
      state: 'unexplored',
      connectedTo: ['R2', 'R6'],
      hasEnemies: true,
      hasElevator: false,
    },
    {
      id: 'R4',
      code: 'R4',
      name: '撤离电梯井',
      gridX: 0,
      gridY: 1,
      x: 0,
      y: 8,
      w: ROOM_OUTER_W,
      h: ROOM_OUTER_H,
      state: 'elevator',
      connectedTo: ['R1', 'R5'],
      hasEnemies: false,
      hasElevator: true,
    },
    {
      id: 'R5',
      code: 'R5',
      name: '安保值班室',
      gridX: 1,
      gridY: 1,
      x: 10,
      y: 8,
      w: ROOM_OUTER_W,
      h: ROOM_OUTER_H,
      state: 'unexplored',
      connectedTo: ['R2', 'R4', 'R6'],
      hasEnemies: true,
      hasElevator: false,
    },
    {
      id: 'R6',
      code: 'R6',
      name: '高压核心仓',
      gridX: 2,
      gridY: 1,
      x: 20,
      y: 8,
      w: ROOM_OUTER_W,
      h: ROOM_OUTER_H,
      state: 'unexplored',
      connectedTo: ['R3', 'R5'],
      hasEnemies: true,
      hasElevator: false,
    },
  ];

  // Build 31x17 tile grid from compact fixed-frame rooms
  const tileGrid = new Map<string, TileCell>();
  for (let y = 0; y < FLOOR_H; y++) {
    for (let x = 0; x < FLOOR_W; x++) {
      tileGrid.set(`${x},${y}`, {
        x,
        y,
        roomId: null,
        kind: 'void',
        surface: 'none',
        electrified: false,
        revealed: false,
        explored: false,
      });
    }
  }

  for (const room of rooms) {
    const isRevealed = room.state !== 'unexplored';
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        const x = room.x + dx;
        const y = room.y + dy;
        const isBorder = dx === 0 || dy === 0 || dx === room.w - 1 || dy === room.h - 1;
        const cell = tileGrid.get(`${x},${y}`)!;

        if (isBorder) {
          // Shared wall stays wall unless turned into a door below; revealed if either adjacent room is revealed
          if (cell.kind === 'void') cell.kind = 'wall';
          if (isRevealed) {
            cell.revealed = true;
            cell.explored = true;
          }
          if (!cell.roomId || isRevealed) {
            cell.roomId = room.id;
          }
        } else {
          cell.kind = 'floor';
          cell.roomId = room.id;
          cell.revealed = isRevealed;
          cell.explored = isRevealed;
        }
      }
    }
  }

  const setTile = (x: number, y: number, patch: Partial<TileCell>) => {
    const cell = tileGrid.get(`${x},${y}`);
    if (cell) Object.assign(cell, patch);
  };

  // Doors between rooms (midpoint of shared walls)
  setTile(10, 4, { kind: 'door_open', revealed: true, explored: true, roomId: 'R2' }); // R1 <-> R2
  setTile(5, 8, { kind: 'door_open', revealed: true, explored: true, roomId: 'R4' }); // R1 <-> R4
  setTile(20, 4, { kind: 'door_closed', revealed: true, explored: true, roomId: 'R2' }); // R2 <-> R3 (fog!)
  setTile(15, 8, { kind: 'door_closed', revealed: true, explored: true, roomId: 'R2' }); // R2 <-> R5 (fog!)
  setTile(10, 12, { kind: 'door_closed', revealed: true, explored: true, roomId: 'R4' }); // R4 <-> R5 (fog!)
  setTile(20, 12, { kind: 'door_closed', revealed: false, explored: false, roomId: 'R5' }); // R5 <-> R6
  setTile(25, 8, { kind: 'door_closed', revealed: false, explored: false, roomId: 'R3' }); // R3 <-> R6

  // Extraction elevator in R4
  setTile(5, 12, { kind: 'elevator' });

  // === Primary Exclusive Surfaces in R2 (Showcase all 4 surfaces!) ===
  // Fire + Oil corner (top-left of R2)
  setTile(11, 1, { surface: 'fire', surfaceTurns: 2 });
  setTile(12, 1, { surface: 'oil' });
  setTile(11, 2, { surface: 'oil' });
  setTile(12, 2, { surface: 'oil' });

  // Ice slide lane (mid-right of R2)
  setTile(15, 3, { surface: 'ice' });
  setTile(16, 3, { surface: 'ice' });
  setTile(17, 3, { surface: 'ice' });

  // Left water pool + Power Box
  setTile(11, 6, { surface: 'water' });
  setTile(12, 5, { surface: 'water' });
  setTile(13, 5, { surface: 'water' });
  setTile(12, 6, { surface: 'water' });
  setTile(13, 6, { surface: 'water' });

  // Right water pool (separated from left pool by dry tiles (14,5) and (14,6) -> Conductive Bridge!)
  setTile(15, 5, { surface: 'water' });
  setTile(16, 5, { surface: 'water' });
  setTile(15, 6, { surface: 'water' });
  setTile(16, 6, { surface: 'water' });

  // Ambient surfaces in R1 & R4
  setTile(4, 6, { surface: 'water' });
  setTile(5, 6, { surface: 'water' });
  setTile(3, 14, { surface: 'oil' });
  setTile(4, 14, { surface: 'oil' });

  const props: PropView[] = [
    // R2 centerpiece props (all 6 prop kinds visible!)
    {
      id: 'prop-barrel-1',
      name: '高爆燃料桶',
      kind: 'explosive_barrel',
      x: 12,
      y: 2,
      hp: 2,
      maxHp: 2,
      tags: ['Fragile', 'Explosive', 'Flammable'],
      summary: '引爆对 3×3 造成 4 伤、向外击退 1 格并点燃周围地表',
    },
    {
      id: 'prop-loot-orange',
      name: '等离子高频刃 [斩落件]',
      kind: 'dropped_part',
      x: 13,
      y: 1,
      tags: ['Conductive', 'Item', 'Pickupable'],
      rarity: 'legendary',
      integrityPct: 92,
      summary: '高价值传奇橙武！正处于履带执法者射界内，可在 (14,1) 投货舱挡枪保护',
    },
    {
      id: 'prop-crate-1',
      name: '重型货箱',
      kind: 'heavy_crate',
      x: 18,
      y: 2,
      hp: 6,
      maxHp: 6,
      tags: ['HeavyBlocker', 'Conductive'],
      summary: '阻挡移动与射线；单位撞击时额外眩晕 1 回合',
    },
    {
      id: 'prop-pipe-1',
      name: '液氮冷却管',
      kind: 'cooling_pipe',
      x: 18,
      y: 3,
      hp: 2,
      maxHp: 2,
      tags: ['Fragile', 'CryoSource'],
      summary: '受击或被滑行撞击时爆裂，周围 3×3 结冰并大幅降温',
    },
    {
      id: 'prop-powerbox-1',
      name: '高压配电箱',
      kind: 'power_box',
      x: 11,
      y: 6,
      hp: 3,
      maxHp: 3,
      tags: ['Fragile', 'Conductive', 'ElectroSource'],
      summary: '坐落于积水中；受击破坏后沿连通导电网络释放高压电弧',
    },
    {
      id: 'prop-pod-1',
      name: '已部署货舱',
      kind: 'cargo_pod',
      x: 17,
      y: 4,
      hp: 4,
      maxHp: 4,
      tags: ['HeavyBlocker', 'Conductive'],
      summary: '投掷部署的战术货舱，可截断敌方直线射线或桥接导电',
    },
    // R1 & R4 props
    {
      id: 'prop-loot-r1',
      name: '破损电击棍 [病毒]',
      kind: 'dropped_part',
      x: 7,
      y: 4,
      tags: ['Conductive', 'Item', 'Virus'],
      rarity: 'rare',
      virus: true,
      integrityPct: 85,
      summary: 'EMP 击落件，带病毒词条（机库可花废料点净化）',
    },
    {
      id: 'prop-crate-r1',
      name: '重型货箱',
      kind: 'heavy_crate',
      x: 3,
      y: 2,
      hp: 6,
      maxHp: 6,
      tags: ['HeavyBlocker', 'Conductive'],
      summary: '掩体货箱',
    },
    {
      id: 'prop-crate-r4a',
      name: '重型货箱',
      kind: 'heavy_crate',
      x: 3,
      y: 11,
      hp: 6,
      maxHp: 6,
      tags: ['HeavyBlocker', 'Conductive'],
      summary: '电梯厅掩体',
    },
    {
      id: 'prop-barrel-r4',
      name: '高爆燃料桶',
      kind: 'explosive_barrel',
      x: 7,
      y: 13,
      hp: 2,
      maxHp: 2,
      tags: ['Fragile', 'Explosive'],
      summary: '可用于坚守电梯时设伏',
    },
  ];

  const units: UnitView[] = [
    {
      id: 'player',
      name: '工兵改装体 MK-IV',
      kind: 'player',
      faction: 'player',
      x: 13,
      y: 3,
      hp: 11,
      maxHp: 11,
      heat: 56,
      maxHeat: 100,
      facing: 'E',
      statuses: ['overheated'],
      tags: ['Chassis', 'OpticSensor', 'Conductive'],
      summary: '标准反应堆构筑；当前处于过热区 (56/100)，可超频或借冰面降温',
    },
    {
      id: 'enemy-grunt',
      name: '安保步兵 #04',
      kind: 'grunt',
      faction: 'enemy',
      x: 14,
      y: 3,
      hp: 5,
      maxHp: 5,
      facing: 'W',
      statuses: ['stunned'],
      tags: ['Humanoid', 'Conductive'],
      parts: [
        { slotLabel: '右臂', name: '制式电击棍', durability: 3, maxDurability: 3, rarity: 'common', severable: true },
        { slotLabel: '左臂', name: '防暴护盾', durability: 3, maxDurability: 3, rarity: 'common', severable: true },
      ],
      summary: '已陷入眩晕（原近战意图失效）；紧邻冰面，极适合破拳套击退撞管！',
    },
    {
      id: 'enemy-enforcer',
      name: '履带执法者',
      kind: 'enforcer',
      faction: 'enemy',
      x: 16,
      y: 1,
      hp: 11,
      maxHp: 11,
      facing: 'W',
      statuses: [],
      tags: ['Heavy', 'AntiKnockback', 'Conductive'],
      rarity: 'legendary',
      parts: [
        { slotLabel: '右臂', name: '电磁脉冲炮 ★', durability: 4, maxDurability: 4, rarity: 'legendary', severable: true },
        { slotLabel: '下肢', name: '重型履带', durability: 5, maxDurability: 5, rarity: 'rare', severable: true },
      ],
      summary: '免疫击退；正沿西向直线蓄力开火，射界穿过地上的传奇橙装！',
    },
    {
      id: 'enemy-drone',
      name: '侦查无人机',
      kind: 'drone',
      faction: 'enemy',
      x: 15,
      y: 5,
      hp: 4,
      maxHp: 4,
      facing: 'W',
      statuses: ['overheated'],
      tags: ['Hover', 'OpticSensor', 'PrecisionCircuit'],
      parts: [
        { slotLabel: '挂载', name: '微型激光器', durability: 2, maxDurability: 2, rarity: 'rare', severable: true },
      ],
      summary: '悬浮于右滩积水上方，带 [OpticSensor] 与 [PrecisionCircuit]，受导电增伤',
    },
    {
      id: 'enemy-hacker',
      name: '企业骇客',
      kind: 'hacker',
      faction: 'enemy',
      x: 16,
      y: 6,
      hp: 6,
      maxHp: 6,
      facing: 'N',
      statuses: ['virus'],
      tags: ['Humanoid', 'OpticSensor', 'Conductive'],
      parts: [
        { slotLabel: '左臂', name: '数据刺模组', durability: 3, maxDurability: 3, rarity: 'rare', severable: true },
      ],
      summary: '身处右侧积水并携带病毒义体；搭桥导电可与无人机一网打尽',
    },
    {
      id: 'enemy-sentry',
      name: '固定哨戒炮',
      kind: 'sentry',
      faction: 'enemy',
      x: 18,
      y: 6,
      hp: 6,
      maxHp: 6,
      facing: 'N',
      statuses: [],
      tags: ['Immobile', 'OpticSensor', 'Conductive'],
      parts: [
        { slotLabel: '炮塔', name: '高频穿透炮', durability: 4, maxDurability: 4, rarity: 'rare', severable: false },
      ],
      summary: '固定高火力射界向北瞄准冷却管；可用数据刺逆时针偏转 90° 误伤同伙！',
    },
    // Dormant enemies inside unexplored fog rooms
    {
      id: 'enemy-dormant-r3',
      name: '金库守卫',
      kind: 'enforcer',
      faction: 'enemy',
      x: 25,
      y: 4,
      hp: 12,
      maxHp: 12,
      facing: 'W',
      statuses: ['dormant'],
      tags: ['Heavy', 'AntiKnockback'],
      dormant: true,
      summary: '未破门房间内休眠单位',
    },
  ];

  const intents: IntentView[] = [
    {
      id: 'intent-grunt',
      sourceUnitId: 'enemy-grunt',
      label: '电击棍突刺',
      kind: 'melee',
      direction: 'S',
      origin: { x: 14, y: 3 },
      affectedTiles: [{ x: 14, y: 4 }],
      damage: 2,
      damageType: 'electro',
      disabled: true,
      disabledReason: '眩晕失效',
    },
    {
      id: 'intent-enforcer',
      sourceUnitId: 'enemy-enforcer',
      label: '重型脉冲压制',
      kind: 'line',
      direction: 'W',
      origin: { x: 16, y: 1 },
      affectedTiles: [
        { x: 15, y: 1 },
        { x: 14, y: 1 },
        { x: 13, y: 1 },
      ],
      damage: 4,
      damageType: 'explosive',
      threatensLoot: true,
    },
    {
      id: 'intent-drone',
      sourceUnitId: 'enemy-drone',
      label: '激光点射',
      kind: 'ranged',
      direction: 'W',
      origin: { x: 15, y: 5 },
      affectedTiles: [
        { x: 14, y: 5 },
        { x: 13, y: 5 },
      ],
      damage: 2,
      damageType: 'thermal',
    },
    {
      id: 'intent-sentry',
      sourceUnitId: 'enemy-sentry',
      label: '穿透激光炮',
      kind: 'line',
      direction: 'N',
      origin: { x: 18, y: 6 },
      affectedTiles: [
        { x: 18, y: 5 },
        { x: 18, y: 4 },
        { x: 18, y: 3 },
      ],
      damage: 3,
      damageType: 'thermal',
    },
  ];

  const logs: CombatLogEntry[] = [
    {
      id: 'log-1',
      turn: 3,
      phase: 'SYS',
      text: '破门进入 [R2 · 冷却配电间]，5 个敌方信号激活并亮出首轮意图。',
      tone: 'system',
    },
    {
      id: 'log-2',
      turn: 3,
      phase: 'PLAYER',
      text: '对安保步兵 #04 触发眩晕，其近战意图 [电击棍突刺] 已失效！',
      tone: 'electro',
    },
    {
      id: 'log-3',
      turn: 3,
      phase: 'ENEMY',
      text: '警告：履带执法者 [重型脉冲压制] 射界覆盖地上传奇橙装 [等离子高频刃]！',
      tone: 'loot',
    },
    {
      id: 'log-4',
      turn: 3,
      phase: 'SYS',
      text: '提示：按 1~6 切换悬停预览样板；悬停敌人聚焦意图；点击顶栏按钮回放涌现动效。',
      tone: 'system',
    },
  ];

  return {
    floorLabel: '80F · 冷却配电层',
    turn: 3,
    mode: 'combat',
    phase: 'player',
    width: FLOOR_W,
    height: FLOOR_H,
    currentRoomId: 'R2',
    tiles: Array.from(tileGrid.values()),
    props,
    units,
    intents,
    rooms,
    player: {
      name: '工兵改装体 MK-IV',
      hp: 11,
      maxHp: 11,
      ap: 3,
      maxAp: 4,
      carryoverAp: 1,
      heat: 56,
      maxHeat: 100,
      heatCooldownPerTurn: 20,
      overclockUsed: false,
      scrap: 45,
      chassisTags: ['OpticSensor', 'Conductive'],
      chest: {
        id: 'part-chest',
        name: '标准反应堆 Mk.2',
        slot: 'chest',
        durability: 11,
        maxDurability: 11,
        rarity: 'common',
        tags: ['Reactor', '4AP'],
        summary: '基础 4 AP / 核心 11 HP，仅机库可换',
      },
      legs: {
        id: 'part-legs',
        name: '悬浮滑行足',
        slot: 'legs',
        durability: 4,
        maxDurability: 5,
        rarity: 'rare',
        tags: ['Hover', 'IgnoreHazard'],
        summary: '无视油火与积水移动代价',
      },
      armL: {
        id: 'part-arm-l',
        name: '液压破拳套',
        slot: 'arm_l',
        durability: 4,
        maxDurability: 4,
        rarity: 'common',
        tags: ['Kinetic', 'Knockback+1'],
        apCost: 1,
        damage: 2,
        summary: '1 AP · 2 伤 + 1 格击退（动能掉率 50%）',
      },
      armR: {
        id: 'part-arm-r',
        name: '高频斩骨刃',
        slot: 'arm_r',
        durability: 3,
        maxDurability: 4,
        rarity: 'legendary',
        tags: ['Slash', 'Severable90%'],
        apCost: 2,
        damage: 4,
        heatCost: 8,
        summary: '2 AP · 精准斩落完好率 90%',
      },
      back: [
        {
          id: 'part-back-1',
          name: '战术货舱 #1',
          slot: 'back',
          durability: 4,
          maxDurability: 4,
          rarity: 'common',
          tags: ['Cargo', 'Throwable'],
          summary: '满载战利品，可投掷作重型阻挡物',
          cargoItem: {
            name: 'EMP 电磁核',
            rarity: 'rare',
            integrityPct: 85,
            virus: true,
          },
        },
        {
          id: 'part-back-2',
          name: '战术货舱 #2',
          slot: 'back',
          durability: 4,
          maxDurability: 4,
          rarity: 'common',
          tags: ['Cargo', 'Empty'],
          summary: '空槽，可拾取 1 件额外战利品带出',
        },
        {
          id: 'part-back-3',
          name: '液冷散热片',
          slot: 'back',
          durability: 3,
          maxDurability: 3,
          rarity: 'common',
          tags: ['HeatSink-10'],
          summary: '每回合降温 -10 热量',
        },
        {
          id: 'part-back-4',
          name: '超导散热片 [病毒]',
          slot: 'back',
          durability: 2,
          maxDurability: 3,
          rarity: 'rare',
          tags: ['HeatSink-10', 'Virus'],
          virus: true,
          summary: '每回合降温 -10，但含未净化病毒词条',
        },
      ],
      consumables: [
        {
          id: 'cons-adrenaline',
          name: '肾上腺电池',
          count: 2,
          maxCount: 2,
          apCost: 0,
          summary: '0 AP 使用，立即 +2 AP（单局消耗）',
        },
        null,
      ],
    },
    actions: DEFAULT_ACTIONS,
    logs,
  };
}

/**
 * Interactive mock Dry-Run preview generator for visual acceptance of all 6 tactical overlays.
 */
export function computeMockPreview(
  snapshot: RenderSnapshot,
  actionId: string,
  hoverTile: Vec2 | null,
  hackRotateCW: boolean,
): PreviewOverlay | null {
  if (!hoverTile) return null;
  const cell = getTile(snapshot, hoverTile.x, hoverTile.y);
  if (!cell || !cell.revealed || cell.kind === 'void') return null;

  const player = snapshot.units.find((u) => u.id === 'player');
  if (!player) return null;

  if (actionId === 'move') {
    return buildMovePreview(snapshot, player, hoverTile, cell);
  }
  if (actionId === 'power_fist') {
    return buildKineticPreview(snapshot, player, hoverTile);
  }
  if (actionId === 'hf_blade') {
    return buildSeverPreview(snapshot, player, hoverTile);
  }
  if (actionId === 'shock_baton') {
    return buildElectroPreview(snapshot, hoverTile);
  }
  if (actionId === 'data_spike') {
    return buildHackPreview(snapshot, hoverTile, hackRotateCW);
  }
  if (actionId === 'throw_pod') {
    return buildThrowPodPreview(snapshot, player, hoverTile, cell);
  }
  return null;
}

function buildMovePreview(
  snapshot: RenderSnapshot,
  player: UnitView,
  target: Vec2,
  cell: TileCell,
): PreviewOverlay | null {
  if (target.x === player.x && target.y === player.y) return null;
  if (cell.kind === 'wall' || cell.kind === 'door_closed') return null;
  if (isTileBlockedForMove(snapshot, target.x, target.y)) return null;

  const path = findSimplePath(snapshot, { x: player.x, y: player.y }, target);
  if (!path || path.length < 2) return null;

  const steps = path.length - 1;
  const canAfford = steps <= snapshot.player.ap;
  return {
    kind: 'move',
    targetTile: target,
    valid: canAfford,
    apCost: steps,
    movePath: path,
    badgeTitle: canAfford ? `移动 · ${steps} AP` : `AP 不足（需 ${steps} AP）`,
    badgeDetail:
      cell.surface === 'fire'
        ? '悬浮腿无视火伤代价，停留回合末仍升温'
        : cell.kind === 'elevator'
          ? '站上后 1 AP 启动撤离电梯'
          : undefined,
  };
}

function buildKineticPreview(
  snapshot: RenderSnapshot,
  player: UnitView,
  target: Vec2,
): PreviewOverlay {
  const unit = snapshot.units.find((u) => u.x === target.x && u.y === target.y && u.id !== 'player');
  const prop = snapshot.props.find((p) => p.x === target.x && p.y === target.y);

  // Direction from player (or default East if hovering distant unit so user can preview anywhere!)
  const dxRaw = target.x - player.x;
  const dyRaw = target.y - player.y;
  let dir: CardinalDir = 'E';
  if (Math.abs(dxRaw) >= Math.abs(dyRaw)) {
    dir = dxRaw >= 0 ? 'E' : 'W';
  } else {
    dir = dyRaw >= 0 ? 'S' : 'N';
  }
  const vec = DIR_VECTORS[dir];

  if (unit) {
    const antiKb = unit.tags.includes('AntiKnockback') || unit.tags.includes('Immobile');
    if (antiKb) {
      return {
        kind: 'kinetic',
        targetTile: target,
        valid: true,
        apCost: 1,
        damageType: 'kinetic',
        dropIntegrityPct: 50,
        badgeTitle: `破拳套 · 2 伤（目标防击退）`,
        badgeDetail: `${unit.name} 带有 [${unit.tags.includes('Immobile') ? 'Immobile' : 'AntiKnockback'}]`,
      };
    }

    const slidePath: Vec2[] = [{ x: unit.x, y: unit.y }];
    let cx = unit.x;
    let cy = unit.y;
    let impactTile: Vec2 | undefined;
    let impactLabel: string | undefined;

    for (let step = 0; step < 8; step++) {
      const nx = cx + vec.x;
      const ny = cy + vec.y;
      const nextCell = getTile(snapshot, nx, ny);
      const blockingProp = snapshot.props.find(
        (p) => p.x === nx && p.y === ny && p.kind !== 'dropped_part',
      );
      const blockingUnit = snapshot.units.find((u) => u.x === nx && u.y === ny && u.id !== unit.id);

      if (!nextCell || nextCell.kind === 'wall' || nextCell.kind === 'door_closed') {
        impactTile = { x: nx, y: ny };
        impactLabel = '撞墙 -1';
        break;
      }
      if (blockingProp) {
        impactTile = { x: nx, y: ny };
        if (blockingProp.kind === 'cooling_pipe') {
          impactLabel = '撞管引爆 · 3×3 结冰';
        } else if (blockingProp.kind === 'heavy_crate' || blockingProp.kind === 'cargo_pod') {
          impactLabel = '撞重物 -1 + 眩晕';
        } else if (blockingProp.kind === 'explosive_barrel') {
          impactLabel = '引爆燃料桶 · 3×3 爆炸';
        } else if (blockingProp.kind === 'power_box') {
          impactLabel = '撞爆配电箱 · 全网导电';
        } else {
          impactLabel = '撞击 -1';
        }
        break;
      }
      if (blockingUnit) {
        impactTile = { x: nx, y: ny };
        impactLabel = `撞击 ${blockingUnit.name} 各-1`;
        break;
      }

      cx = nx;
      cy = ny;
      slidePath.push({ x: cx, y: cy });

      // Keep sliding ONLY while entering ice tiles
      if (nextCell.surface !== 'ice') {
        break;
      }
    }

    const slidTiles = slidePath.length - 1;
    return {
      kind: 'kinetic',
      targetTile: target,
      valid: true,
      apCost: 1,
      slidePath,
      impactTile,
      impactLabel,
      damageType: 'kinetic',
      dropIntegrityPct: 50,
      badgeTitle: `破拳套 · 2 伤 + 滑行 ${slidTiles} 格`,
      badgeDetail: impactLabel ? `连锁触发: ${impactLabel}` : '击退后落于空地',
    };
  }

  if (prop) {
    return {
      kind: 'kinetic',
      targetTile: target,
      valid: true,
      apCost: 1,
      impactTile: target,
      impactLabel:
        prop.kind === 'cooling_pipe'
          ? '击爆 · 3×3 结冰'
          : prop.kind === 'explosive_barrel'
            ? '引爆 · 3×3 燃烧'
            : prop.kind === 'power_box'
              ? '破坏 · 释放电弧'
              : '击打物件',
      badgeTitle: `破拳套 · 攻击 ${prop.name}`,
      badgeDetail: prop.summary,
    };
  }

  return {
    kind: 'kinetic',
    targetTile: target,
    valid: false,
    badgeTitle: '破拳套 · 请悬停敌人或设施',
    badgeDetail: '试试悬停安保步兵 (14,3) 查看冰滑撞管轨迹',
  };
}

function buildSeverPreview(
  snapshot: RenderSnapshot,
  player: UnitView,
  target: Vec2,
): PreviewOverlay {
  const unit = snapshot.units.find((u) => u.x === target.x && u.y === target.y && u.faction === 'enemy');
  if (!unit) {
    return {
      kind: 'sever',
      targetTile: target,
      valid: false,
      badgeTitle: '精准斩落 · 请悬停敌方单位',
      badgeDetail: '试试悬停履带执法者 (16,1) 预览斩落传奇橙武',
    };
  }

  const severPart = unit.parts?.find((p) => p.severable) ?? unit.parts?.[0];
  const dist = Math.abs(unit.x - player.x) + Math.abs(unit.y - player.y);
  const willSever = severPart ? severPart.durability <= 4 : false;

  return {
    kind: 'sever',
    targetTile: target,
    valid: true,
    apCost: 2,
    damageType: 'slash',
    dropIntegrityPct: 90,
    badgeTitle: `精准斩落 · 目标 [${severPart ? severPart.name : '外挂部件'}]`,
    badgeDetail: severPart
      ? `定向伤害 4 → 耐久 ${severPart.durability}/${severPart.maxDurability} (${willSever ? '一击斩落 + 取消意图!' : '重创'})`
      : '定向破坏外挂槽位',
    warningText: dist > 1 ? `预览样板（当前距离 ${dist} 格，实战需贴身）` : undefined,
  };
}

function buildElectroPreview(snapshot: RenderSnapshot, target: Vec2): PreviewOverlay {
  const network = computeConductiveNetwork(snapshot, target);
  if (network.tiles.length === 0) {
    return {
      kind: 'electro',
      targetTile: target,
      valid: false,
      badgeTitle: '电击棍 · 非导电格',
      badgeDetail: '试试悬停积水 (15,5) 或配电箱 (11,6) 查看导电网络',
    };
  }

  const affectedUnits = snapshot.units.filter((u) =>
    network.tiles.some((t) => t.x === u.x && t.y === u.y),
  );
  const opticCount = affectedUnits.filter(
    (u) => u.tags.includes('OpticSensor') || u.tags.includes('PrecisionCircuit'),
  ).length;

  return {
    kind: 'electro',
    targetTile: target,
    valid: true,
    apCost: 2,
    electroTiles: network.tiles,
    electroEdges: network.edges,
    electroAffectedUnitIds: affectedUnits.map((u) => u.id),
    damageType: 'electro',
    dropIntegrityPct: 85,
    badgeTitle: `导电网络 · ${network.tiles.length} 格连通`,
    badgeDetail:
      affectedUnits.length > 0
        ? `波及 ${affectedUnits.length} 单位（全员眩晕${opticCount > 0 ? `，${opticCount} 名义眼增伤` : ''}）`
        : '导电通路就绪（提示：切 [6] 投掷货舱到 (14,5) 可桥接两滩水！）',
    warningText: 'EMP 击落将附带 [病毒] 词条',
  };
}

function buildHackPreview(
  snapshot: RenderSnapshot,
  target: Vec2,
  rotateCW: boolean,
): PreviewOverlay {
  const unit = snapshot.units.find((u) => u.x === target.x && u.y === target.y && u.faction === 'enemy');
  const intent = unit
    ? snapshot.intents.find((i) => i.sourceUnitId === unit.id && !i.disabled)
    : undefined;

  if (!unit || !intent) {
    return {
      kind: 'hack',
      targetTile: target,
      valid: false,
      badgeTitle: '数据刺 · 请悬停有激活意图的敌人',
      badgeDetail: '试试悬停哨戒炮 (18,6) 或履带执法者 (16,1)，按 Q/E 切换顺逆 90°',
    };
  }

  const nextDir = rotateDir(intent.direction, rotateCW);
  const rotatedTiles = traceIntentRay(snapshot, intent.origin, nextDir, intent.affectedTiles.length);
  const hitFriendlies = snapshot.units.filter(
    (u) => u.faction === 'enemy' && rotatedTiles.some((t) => t.x === u.x && t.y === u.y),
  );
  const hitsWater = rotatedTiles.some((t) => getTile(snapshot, t.x, t.y)?.surface === 'water');

  return {
    kind: 'hack',
    targetTile: target,
    valid: true,
    apCost: 1,
    hackedIntentId: intent.id,
    rotatedIntent: {
      direction: nextDir,
      origin: intent.origin,
      affectedTiles: rotatedTiles,
      label: intent.label,
      damage: intent.damage,
    },
    badgeTitle: `数据刺 · ${rotateCW ? '顺时针' : '逆时针'}偏转 90° (Q/E 切换)`,
    badgeDetail:
      hitFriendlies.length > 0
        ? `新射界命中敌方同伙 [${hitFriendlies.map((u) => u.name).join('、')}]！`
        : hitsWater
          ? '新射界已偏离原目标并指向积水区'
          : `实时重算新落点：${rotatedTiles.length} 格`,
  };
}

function buildThrowPodPreview(
  snapshot: RenderSnapshot,
  player: UnitView,
  target: Vec2,
  cell: TileCell,
): PreviewOverlay {
  const dist = Math.abs(target.x - player.x) + Math.abs(target.y - player.y);
  const occupied =
    snapshot.units.some((u) => u.x === target.x && u.y === target.y) ||
    snapshot.props.some((p) => p.x === target.x && p.y === target.y && p.kind !== 'dropped_part');
  const validTile = cell.kind === 'floor' && !occupied && dist >= 1 && dist <= 3;

  // Check if placing a conductive HeavyBlocker here bridges water pools!
  const bridgedNetwork = validTile ? computeConductiveNetwork(snapshot, target, target) : null;
  const bridgesPools = bridgedNetwork && bridgedNetwork.tiles.length >= 6;

  // Check if placing a HeavyBlocker here intercepts an enemy line intent!
  let blockedIntentId: string | undefined;
  let blockedTiles: Vec2[] | undefined;
  if (validTile) {
    for (const intent of snapshot.intents) {
      if (intent.disabled || intent.kind !== 'line') continue;
      const idx = intent.affectedTiles.findIndex((t) => t.x === target.x && t.y === target.y);
      if (idx >= 0 && idx < intent.affectedTiles.length - 1) {
        blockedIntentId = intent.id;
        blockedTiles = intent.affectedTiles.slice(idx + 1);
        break;
      }
    }
  }

  const affectedUnitIds = bridgesPools
    ? snapshot.units
        .filter((u) => bridgedNetwork.tiles.some((t) => t.x === u.x && t.y === u.y))
        .map((u) => u.id)
    : undefined;

  return {
    kind: 'throw',
    targetTile: target,
    valid: validTile,
    apCost: 1,
    throwFrom: { x: player.x, y: player.y },
    throwTo: target,
    electroTiles: bridgesPools ? bridgedNetwork.tiles : undefined,
    electroEdges: bridgesPools ? bridgedNetwork.edges : undefined,
    electroAffectedUnitIds: affectedUnitIds,
    blockedIntentId,
    blockedTiles,
    badgeTitle: !validTile
      ? `投掷货舱 · 需 1~3 格空地（当前距离 ${dist}）`
      : bridgesPools
        ? `投掷货舱 · 桥接导电全网 (${bridgedNetwork.tiles.length} 格!)`
        : blockedIntentId
          ? '投掷货舱 · 截断敌方直线射线（护宝成功!）'
          : '投掷货舱 · 部署 [HeavyBlocker, Conductive]',
    badgeDetail: !validTile
      ? '试试悬停 (14,5) 桥接两滩积水，或 (14,1) 帮橙装挡枪！'
      : bridgesPools
        ? '两滩孤立积水合并为完整导电网络'
        : blockedIntentId
          ? `后方 ${blockedTiles?.length ?? 0} 格威胁已截断`
          : '可阻挡射线、作为撞击眩晕垫板或导电节点',
  };
}

/**
 * 4 scripted emergence playback demos for immediate visual verification (120~200ms step cadence).
 */
export function buildDemoEvents(demoId: DemoId, snapshot: RenderSnapshot): RenderEvent[] {
  const turn = snapshot.turn;

  if (demoId === 'ice_slide') {
    return [
      { type: 'highlight_actor', unitId: 'player', label: '破拳套 · 动能击退', durationMs: 260 },
      { type: 'lunge', unitId: 'player', toward: { x: 14, y: 3 }, durationMs: 180 },
      { type: 'impact', pos: { x: 14, y: 3 }, intensity: 4, burstTone: 'overheat', hitUnitId: 'enemy-grunt', durationMs: 200 },
      { type: 'float_text', pos: { x: 14, y: 3 }, text: '-2 动能', tone: 'damage', durationMs: 160 },
      {
        type: 'log',
        entry: {
          id: `demo-ice-1-${Date.now()}`,
          turn,
          phase: 'PLAYER',
          text: '破拳套命中安保步兵 #04 (-2)，击退滑入冰面！',
          tone: 'kinetic',
        },
        durationMs: 0,
      },
      {
        type: 'slide',
        unitId: 'enemy-grunt',
        path: [
          { x: 14, y: 3 },
          { x: 15, y: 3 },
          { x: 16, y: 3 },
          { x: 17, y: 3 },
        ],
        durationMs: 460,
      },
      { type: 'impact', pos: { x: 18, y: 3 }, intensity: 6.8, burstTone: 'cryo', hitUnitId: 'enemy-grunt', durationMs: 260 },
      { type: 'float_text', pos: { x: 17, y: 3 }, text: '-1 撞击', tone: 'damage', durationMs: 160 },
      { type: 'float_text', pos: { x: 18, y: 3 }, text: 'ICE 3×3 结冰', tone: 'cryo', durationMs: 160 },
      {
        type: 'surface_change',
        tiles: [
          { pos: { x: 17, y: 2 }, surface: 'ice' },
          { pos: { x: 18, y: 2 }, surface: 'ice' },
          { pos: { x: 19, y: 2 }, surface: 'ice' },
          { pos: { x: 17, y: 3 }, surface: 'ice' },
          { pos: { x: 18, y: 3 }, surface: 'ice' },
          { pos: { x: 19, y: 3 }, surface: 'ice' },
          { pos: { x: 17, y: 4 }, surface: 'ice' },
          { pos: { x: 18, y: 4 }, surface: 'ice' },
          { pos: { x: 19, y: 4 }, surface: 'ice' },
        ],
        durationMs: 260,
      },
      {
        type: 'unit_status',
        unitId: 'enemy-grunt',
        hpDelta: -3,
        add: ['stunned'],
        durationMs: 260,
      },
      {
        type: 'log',
        entry: {
          id: `demo-ice-2-${Date.now()}`,
          turn,
          phase: 'ENV',
          text: '连锁：安保步兵沿冰滑行 3 格撞碎液氮冷却管，周围 3×3 瞬间结冰！',
          tone: 'cryo',
        },
        durationMs: 0,
      },
    ];
  }

  if (demoId === 'electro_bridge') {
    const bridgePos = { x: 14, y: 5 };
    const bridgeTiles: Vec2[] = [
      { x: 11, y: 6 },
      { x: 12, y: 5 },
      { x: 13, y: 5 },
      { x: 12, y: 6 },
      { x: 13, y: 6 },
      { x: 14, y: 5 },
      { x: 15, y: 5 },
      { x: 16, y: 5 },
      { x: 15, y: 6 },
      { x: 16, y: 6 },
    ];
    return [
      { type: 'highlight_actor', unitId: 'player', label: '抛掷断臂搭桥', durationMs: 320 },
      {
        type: 'spawn_prop',
        prop: {
          id: `bridge-arm-${Date.now()}`,
          name: '废铁机械臂 [导电桥]',
          kind: 'dropped_part',
          x: bridgePos.x,
          y: bridgePos.y,
          tags: ['Conductive', 'Item'],
          rarity: 'common',
          integrityPct: 50,
          summary: '刚刚抛掷落地，成功桥接左右两滩积水！',
        },
        durationMs: 220,
      },
      { type: 'float_text', pos: bridgePos, text: '导电桥接!', tone: 'electro', durationMs: 300 },
      {
        type: 'log',
        entry: {
          id: `demo-elec-1-${Date.now()}`,
          turn,
          phase: 'PLAYER',
          text: '将废铁机械臂抛至干地 (14,5)，两滩积水合并为 10 格导电网络！',
          tone: 'electro',
        },
        durationMs: 0,
      },
      {
        type: 'electro_arc',
        tiles: bridgeTiles,
        segments: [
          { from: { x: 13, y: 3 }, to: { x: 13, y: 5 } },
          { from: { x: 13, y: 5 }, to: { x: 14, y: 5 } },
          { from: { x: 14, y: 5 }, to: { x: 15, y: 5 } },
          { from: { x: 15, y: 5 }, to: { x: 16, y: 5 } },
          { from: { x: 16, y: 5 }, to: { x: 16, y: 6 } },
          { from: { x: 13, y: 5 }, to: { x: 12, y: 6 } },
          { from: { x: 12, y: 6 }, to: { x: 11, y: 6 } },
        ],
        durationMs: 420,
      },
      { type: 'float_text', pos: { x: 15, y: 5 }, text: '-3 义眼增伤', tone: 'electro', durationMs: 140 },
      { type: 'float_text', pos: { x: 15, y: 5 }, text: '⚡ STUN 眩晕', tone: 'stun', durationMs: 220 },
      { type: 'float_text', pos: { x: 16, y: 6 }, text: '-3 义眼增伤', tone: 'electro', durationMs: 140 },
      { type: 'float_text', pos: { x: 16, y: 6 }, text: '⚡ STUN 眩晕', tone: 'stun', durationMs: 220 },
      { type: 'unit_status', unitId: 'enemy-drone', hpDelta: -3, add: ['stunned'], durationMs: 0 },
      { type: 'unit_status', unitId: 'enemy-hacker', hpDelta: -3, add: ['stunned'], durationMs: 0 },
      {
        type: 'intent_update',
        intentId: 'intent-drone',
        disabled: true,
        disabledReason: '触电眩晕',
        durationMs: 240,
      },
      {
        type: 'log',
        entry: {
          id: `demo-elec-2-${Date.now()}`,
          turn,
          phase: 'ENV',
          text: '高压电弧贯穿全网！侦查无人机与企业骇客触发 [OpticSensor] 增伤 (-3) 并全员眩晕！',
          tone: 'electro',
        },
        durationMs: 0,
      },
    ];
  }

  if (demoId === 'sever_disarm') {
    return [
      { type: 'highlight_actor', unitId: 'player', label: '高频刃 · 精准斩落', durationMs: 280 },
      { type: 'lunge', unitId: 'player', toward: { x: 16, y: 1 }, durationMs: 170 },
      { type: 'slash_arc', pos: { x: 16, y: 1 }, tone: 'disarm', durationMs: 240 },
      { type: 'impact', pos: { x: 16, y: 1 }, intensity: 5.5, burstTone: 'disarm', hitUnitId: 'enemy-enforcer', durationMs: 200 },
      { type: 'float_text', pos: { x: 16, y: 1 }, text: 'DISARM 断臂!', tone: 'disarm', durationMs: 240 },
      {
        type: 'spawn_prop',
        prop: {
          id: `severed-railgun-${Date.now()}`,
          name: '电磁脉冲炮 ★ [90% 完好]',
          kind: 'dropped_part',
          x: 17,
          y: 1,
          tags: ['Conductive', 'Item', 'Pickupable'],
          rarity: 'legendary',
          integrityPct: 90,
          summary: '刚刚从履带执法者右臂精准斩落的传奇橙装！',
        },
        durationMs: 220,
      },
      { type: 'float_text', pos: { x: 17, y: 1 }, text: '★ 90% 完好掉落', tone: 'loot', durationMs: 260 },
      {
        type: 'intent_update',
        intentId: 'intent-enforcer',
        disabled: true,
        disabledReason: '断臂失效',
        durationMs: 260,
      },
      {
        type: 'log',
        entry: {
          id: `demo-sever-1-${Date.now()}`,
          turn,
          phase: 'PLAYER',
          text: '精准斩落履带执法者右臂！传奇 [电磁脉冲炮 ★] 完好落地 (17,1)，其压制意图立即失效！',
          tone: 'loot',
        },
        durationMs: 0,
      },
    ];
  }

  // redline_enemy_turn: Redline overheat discharge (self immune to stun) + stepped enemy intent execution
  return [
    { type: 'highlight_actor', unitId: 'player', label: '红温放电 (自身免晕)', durationMs: 340 },
    {
      type: 'unit_status',
      unitId: 'player',
      add: ['redline'],
      remove: ['overheated'],
      hpDelta: -1,
      durationMs: 180,
    },
    {
      type: 'electro_arc',
      tiles: [
        { x: 13, y: 3 },
        { x: 14, y: 3 },
        { x: 13, y: 4 },
        { x: 13, y: 5 },
      ],
      segments: [
        { from: { x: 13, y: 3 }, to: { x: 14, y: 3 } },
        { from: { x: 13, y: 3 }, to: { x: 13, y: 4 } },
        { from: { x: 13, y: 4 }, to: { x: 13, y: 5 } },
      ],
      durationMs: 380,
    },
    { type: 'float_text', pos: { x: 13, y: 3 }, text: '红温自损 -1', tone: 'overheat', durationMs: 160 },
    { type: 'float_text', pos: { x: 13, y: 3 }, text: '免疫电弧眩晕', tone: 'hack', durationMs: 180 },
    { type: 'float_text', pos: { x: 14, y: 3 }, text: '-2 触电眩晕', tone: 'electro', durationMs: 280 },
    {
      type: 'log',
      entry: {
        id: `demo-red-1-${Date.now()}`,
        turn,
        phase: 'ENV',
        text: '环境阶段：玩家反应堆红温！自动向相邻导电格放电并自损 1 点（自身免疫电弧眩晕）。',
        tone: 'thermal',
      },
      durationMs: 200,
    },
    // Enemy 1: Sentry fires North
    { type: 'highlight_actor', unitId: 'enemy-sentry', label: '敌方阶段 · 哨戒炮开火', durationMs: 360 },
    {
      type: 'ray_flash',
      from: { x: 18, y: 6 },
      to: { x: 18, y: 3 },
      tiles: [
        { x: 18, y: 5 },
        { x: 18, y: 4 },
        { x: 18, y: 3 },
      ],
      tone: 'damage',
      durationMs: 340,
    },
    { type: 'impact', pos: { x: 18, y: 3 }, intensity: 5, durationMs: 220 },
    { type: 'float_text', pos: { x: 18, y: 3 }, text: '-3 冷却管受损!', tone: 'cryo', durationMs: 340 },
    // Enemy 2: Enforcer fires West
    { type: 'highlight_actor', unitId: 'enemy-enforcer', label: '敌方阶段 · 执法者压制', durationMs: 360 },
    {
      type: 'ray_flash',
      from: { x: 16, y: 1 },
      to: { x: 13, y: 1 },
      tiles: [
        { x: 15, y: 1 },
        { x: 14, y: 1 },
        { x: 13, y: 1 },
      ],
      tone: 'overheat',
      durationMs: 360,
    },
    { type: 'impact', pos: { x: 13, y: 1 }, intensity: 5.5, durationMs: 220 },
    { type: 'float_text', pos: { x: 13, y: 1 }, text: '⚠ 橙装受损!', tone: 'loot', durationMs: 340 },
    {
      type: 'log',
      entry: {
        id: `demo-red-2-${Date.now()}`,
        turn,
        phase: 'ENEMY',
        text: '敌方阶段回放完毕：哨戒炮击中冷却管，履带执法者炮火擦伤地上橙装！',
        tone: 'danger',
      },
      durationMs: 0,
    },
  ];
}

/** Applies a state-mutating RenderEvent directly to the live mock snapshot */
export function applyEventToSnapshot(snapshot: RenderSnapshot, event: RenderEvent): void {
  switch (event.type) {
    case 'slide': {
      const unit = snapshot.units.find((u) => u.id === event.unitId);
      const end = event.path[event.path.length - 1];
      if (unit && end) {
        unit.x = end.x;
        unit.y = end.y;
      }
      break;
    }
    case 'surface_change': {
      for (const change of event.tiles) {
        const cell = getTile(snapshot, change.pos.x, change.pos.y);
        if (cell && cell.kind === 'floor') {
          cell.surface = change.surface as SurfaceKind;
        }
      }
      break;
    }
    case 'spawn_prop': {
      snapshot.props.push(event.prop);
      break;
    }
    case 'unit_status': {
      const unit = snapshot.units.find((u) => u.id === event.unitId);
      if (!unit) break;
      if (event.hpDelta) {
        unit.hp = Math.max(1, Math.min(unit.maxHp, unit.hp + event.hpDelta));
        if (unit.id === 'player') {
          snapshot.player.hp = unit.hp;
        }
      }
      if (event.remove) {
        unit.statuses = unit.statuses.filter((s) => !event.remove!.includes(s));
      }
      if (event.add) {
        for (const st of event.add) {
          if (!unit.statuses.includes(st)) unit.statuses.push(st);
        }
        if (unit.id === 'player' && event.add.includes('redline')) {
          snapshot.player.heat = 86;
          unit.heat = 86;
        }
      }
      break;
    }
    case 'intent_update': {
      const intent = snapshot.intents.find((i) => i.id === event.intentId);
      if (!intent) break;
      if (event.disabled !== undefined) intent.disabled = event.disabled;
      if (event.disabledReason !== undefined) intent.disabledReason = event.disabledReason;
      if (event.direction !== undefined) {
        intent.direction = event.direction;
        // Also rotate the source unit's facing so turret barrels / visors swing live!
        const srcUnit = snapshot.units.find((u) => u.id === intent.sourceUnitId);
        if (srcUnit) srcUnit.facing = event.direction;
      }
      if (event.affectedTiles !== undefined) intent.affectedTiles = event.affectedTiles;
      break;
    }
    case 'log': {
      snapshot.logs.push(event.entry);
      if (snapshot.logs.length > 40) {
        snapshot.logs.shift();
      }
      break;
    }
    default:
      break;
  }
}

/** Utility helpers */

export function getTile(snapshot: RenderSnapshot, x: number, y: number): TileCell | undefined {
  if (x < 0 || y < 0 || x >= snapshot.width || y >= snapshot.height) return undefined;
  return snapshot.tiles[y * snapshot.width + x];
}

function isTileConductive(snapshot: RenderSnapshot, x: number, y: number, extraTile?: Vec2): boolean {
  if (extraTile && extraTile.x === x && extraTile.y === y) return true;
  const cell = getTile(snapshot, x, y);
  if (!cell || !cell.revealed || cell.kind === 'wall' || cell.kind === 'void') return false;
  if (cell.surface === 'water') return true;
  return snapshot.props.some((p) => p.x === x && p.y === y && p.tags.includes('Conductive'));
}

function computeConductiveNetwork(
  snapshot: RenderSnapshot,
  start: Vec2,
  virtualConductiveTile?: Vec2,
): { tiles: Vec2[]; edges: Array<{ from: Vec2; to: Vec2 }> } {
  if (!isTileConductive(snapshot, start.x, start.y, virtualConductiveTile)) {
    return { tiles: [], edges: [] };
  }

  const visited = new Set<string>([`${start.x},${start.y}`]);
  const queue: Vec2[] = [start];
  const tiles: Vec2[] = [];
  const edges: Array<{ from: Vec2; to: Vec2 }> = [];
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  while (queue.length > 0 && tiles.length < 32) {
    const cur = queue.shift()!;
    tiles.push(cur);

    for (const d of dirs) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (isTileConductive(snapshot, nx, ny, virtualConductiveTile)) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
        edges.push({ from: cur, to: { x: nx, y: ny } });
      }
    }
  }
  return { tiles, edges };
}

function isTileBlockedForMove(snapshot: RenderSnapshot, x: number, y: number): boolean {
  const cell = getTile(snapshot, x, y);
  if (!cell || !cell.revealed) return true;
  if (cell.kind === 'wall' || cell.kind === 'void' || cell.kind === 'door_closed') return true;
  if (snapshot.units.some((u) => u.x === x && u.y === y)) return true;
  if (snapshot.props.some((p) => p.x === x && p.y === y && p.kind !== 'dropped_part')) return true;
  return false;
}

function findSimplePath(snapshot: RenderSnapshot, from: Vec2, to: Vec2): Vec2[] | null {
  const startKey = `${from.x},${from.y}`;
  const goalKey = `${to.x},${to.y}`;
  const queue: Vec2[] = [from];
  const parent = new Map<string, Vec2 | null>([[startKey, null]]);
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  let visitedCount = 0;
  while (queue.length > 0 && visitedCount < 240) {
    visitedCount++;
    const cur = queue.shift()!;
    const curKey = `${cur.x},${cur.y}`;
    if (curKey === goalKey) {
      const out: Vec2[] = [];
      let p: Vec2 | null = cur;
      while (p) {
        out.push(p);
        p = parent.get(`${p.x},${p.y}`) ?? null;
      }
      return out.reverse();
    }

    for (const d of dirs) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      const nk = `${nx},${ny}`;
      if (parent.has(nk)) continue;
      if (isTileBlockedForMove(snapshot, nx, ny)) continue;
      parent.set(nk, cur);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

function rotateDir(dir: CardinalDir, cw: boolean): CardinalDir {
  const order: CardinalDir[] = ['N', 'E', 'S', 'W'];
  const idx = order.indexOf(dir);
  return order[(idx + (cw ? 1 : 3)) % 4];
}

function traceIntentRay(
  snapshot: RenderSnapshot,
  origin: Vec2,
  dir: CardinalDir,
  maxLen: number,
): Vec2[] {
  const v = DIR_VECTORS[dir];
  const out: Vec2[] = [];
  for (let i = 1; i <= maxLen; i++) {
    const nx = origin.x + v.x * i;
    const ny = origin.y + v.y * i;
    const cell = getTile(snapshot, nx, ny);
    if (!cell || cell.kind === 'wall' || cell.kind === 'door_closed' || cell.kind === 'void') {
      break;
    }
    out.push({ x: nx, y: ny });
    // Stop at heavy blocker prop
    const heavy = snapshot.props.find(
      (p) => p.x === nx && p.y === ny && p.tags.includes('HeavyBlocker'),
    );
    if (heavy) break;
  }
  return out;
}
