export interface Vec2 {
  x: number;
  y: number;
}

export type CardinalDir = 'N' | 'E' | 'S' | 'W';

export type TileKind =
  | 'void'
  | 'floor'
  | 'wall'
  | 'door_closed'
  | 'door_open'
  | 'elevator';

export type SurfaceKind = 'none' | 'water' | 'ice' | 'oil' | 'fire';

export type UnitKind =
  | 'player'
  | 'grunt'
  | 'enforcer'
  | 'drone'
  | 'hacker'
  | 'sentry';

export type PropKind =
  | 'cooling_pipe'
  | 'power_box'
  | 'explosive_barrel'
  | 'heavy_crate'
  | 'cargo_pod'
  | 'dropped_part';

export type StatusTag =
  | 'stunned'
  | 'overheated'
  | 'redline'
  | 'virus'
  | 'dormant';

export type Rarity = 'common' | 'rare' | 'legendary';

export type PartSlot = 'chest' | 'legs' | 'arm_l' | 'arm_r' | 'back';

export type DamageType = 'kinetic' | 'slash' | 'electro' | 'thermal' | 'cryo' | 'hack' | 'explosive';

export type LogTone =
  | 'system'
  | 'kinetic'
  | 'cryo'
  | 'electro'
  | 'thermal'
  | 'hack'
  | 'loot'
  | 'danger';

export interface TileCell {
  x: number;
  y: number;
  roomId: string | null;
  kind: TileKind;
  surface: SurfaceKind;
  surfaceTurns?: number;
  electrified: boolean;
  revealed: boolean;
  explored: boolean;
}

export interface PartView {
  id: string;
  name: string;
  slot: PartSlot;
  durability: number;
  maxDurability: number;
  rarity: Rarity;
  tags: string[];
  virus?: boolean;
  apCost?: number;
  damage?: number;
  heatCost?: number;
  summary: string;
  /** Back cargo pod may carry an extracted loot item */
  cargoItem?: {
    name: string;
    rarity: Rarity;
    integrityPct: number;
    virus?: boolean;
  };
}

export interface ConsumableView {
  id: string;
  name: string;
  count: number;
  maxCount: number;
  apCost: number;
  summary: string;
}

export interface UnitView {
  id: string;
  name: string;
  kind: UnitKind;
  faction: 'player' | 'enemy';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  heat?: number;
  maxHeat?: number;
  facing: CardinalDir;
  statuses: StatusTag[];
  tags: string[];
  rarity?: Rarity;
  dormant?: boolean;
  parts?: Array<{
    slotLabel: string;
    name: string;
    durability: number;
    maxDurability: number;
    rarity: Rarity;
    severable?: boolean;
  }>;
  summary: string;
}

export interface PropView {
  id: string;
  name: string;
  kind: PropKind;
  x: number;
  y: number;
  hp?: number;
  maxHp?: number;
  tags: string[];
  rarity?: Rarity;
  virus?: boolean;
  integrityPct?: number;
  summary: string;
}

export interface IntentView {
  id: string;
  sourceUnitId: string;
  label: string;
  kind: 'melee' | 'ranged' | 'line' | 'area';
  direction: CardinalDir;
  origin: Vec2;
  affectedTiles: Vec2[];
  damage: number;
  damageType: DamageType;
  disabled?: boolean;
  disabledReason?: string;
  threatensLoot?: boolean;
}

export type RoomState = 'current' | 'explored' | 'unexplored' | 'elevator';

export interface RoomMiniView {
  id: string;
  code: string;
  name: string;
  gridX: number;
  gridY: number;
  x: number;
  y: number;
  w: number;
  h: number;
  state: RoomState;
  connectedTo: string[];
  hasEnemies: boolean;
  hasElevator: boolean;
}

export interface ActionSlotView {
  id: string;
  hotkey: string;
  name: string;
  apCost: number;
  heatCost?: number;
  damageType?: DamageType;
  category: 'move' | 'weapon' | 'sever' | 'hack' | 'utility' | 'consumable';
  summary: string;
}

export interface PlayerHudView {
  name: string;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  carryoverAp: number;
  heat: number;
  maxHeat: number;
  heatCooldownPerTurn: number;
  overclockUsed: boolean;
  scrap: number;
  chassisTags: string[];
  chest: PartView;
  legs: PartView;
  armL: PartView;
  armR: PartView;
  back: PartView[];
  consumables: Array<ConsumableView | null>;
}

export interface CombatLogEntry {
  id: string;
  turn: number;
  phase: 'PLAYER' | 'ENV' | 'ENEMY' | 'SYS';
  text: string;
  tone: LogTone;
}

export interface PreviewOverlay {
  kind: 'move' | 'kinetic' | 'sever' | 'electro' | 'hack' | 'throw';
  targetTile: Vec2;
  valid: boolean;
  apCost?: number;
  movePath?: Vec2[];
  /** Knockback / ice slide trajectory */
  slidePath?: Vec2[];
  impactTile?: Vec2;
  impactLabel?: string;
  /** Conductive chain preview */
  electroTiles?: Vec2[];
  electroEdges?: Array<{ from: Vec2; to: Vec2 }>;
  electroAffectedUnitIds?: string[];
  /** Hack rotated intent preview */
  hackedIntentId?: string;
  rotatedIntent?: {
    direction: CardinalDir;
    origin: Vec2;
    affectedTiles: Vec2[];
    label: string;
    damage: number;
  };
  /** Ray-block cut preview (e.g., throwing a cargo pod into a line intent) */
  blockedIntentId?: string;
  blockedTiles?: Vec2[];
  /** Throw arc */
  throwFrom?: Vec2;
  throwTo?: Vec2;
  /** Floating tactical pill metadata */
  badgeTitle?: string;
  badgeDetail?: string;
  dropIntegrityPct?: number;
  damageType?: DamageType;
  warningText?: string;
}

export type FloatTextTone =
  | 'damage'
  | 'stun'
  | 'disarm'
  | 'overheat'
  | 'cryo'
  | 'electro'
  | 'hack'
  | 'loot';

export type RenderEvent =
  | {
      type: 'highlight_actor';
      unitId: string;
      label: string;
      durationMs: number;
    }
  | {
      type: 'slide';
      unitId: string;
      path: Vec2[];
      durationMs: number;
    }
  | {
      type: 'lunge';
      unitId: string;
      toward: Vec2;
      durationMs: number;
    }
  | {
      type: 'slash_arc';
      pos: Vec2;
      tone: FloatTextTone;
      durationMs: number;
    }
  | {
      type: 'hack_pulse';
      pos: Vec2;
      durationMs: number;
    }
  | {
      type: 'impact';
      pos: Vec2;
      label?: string;
      intensity?: number;
      burstTone?: FloatTextTone;
      hitUnitId?: string;
      durationMs: number;
    }
  | {
      type: 'surface_change';
      tiles: Array<{ pos: Vec2; surface: SurfaceKind }>;
      durationMs: number;
    }
  | {
      type: 'electro_arc';
      segments: Array<{ from: Vec2; to: Vec2 }>;
      tiles: Vec2[];
      durationMs: number;
    }
  | {
      type: 'float_text';
      pos: Vec2;
      text: string;
      tone: FloatTextTone;
      durationMs: number;
    }
  | {
      type: 'spawn_prop';
      prop: PropView;
      durationMs: number;
    }
  | {
      type: 'unit_status';
      unitId: string;
      add?: StatusTag[];
      remove?: StatusTag[];
      hpDelta?: number;
      durationMs: number;
    }
  | {
      type: 'intent_update';
      intentId: string;
      disabled?: boolean;
      disabledReason?: string;
      direction?: CardinalDir;
      affectedTiles?: Vec2[];
      durationMs: number;
    }
  | {
      type: 'ray_flash';
      from: Vec2;
      to: Vec2;
      tiles: Vec2[];
      tone: FloatTextTone;
      durationMs: number;
    }
  | {
      type: 'log';
      entry: CombatLogEntry;
      durationMs: number;
    };

export interface RenderSnapshot {
  floorLabel: string;
  turn: number;
  mode: 'combat' | 'explore';
  phase: 'player' | 'env' | 'enemy';
  width: number;
  height: number;
  currentRoomId: string;
  tiles: TileCell[];
  props: PropView[];
  units: UnitView[];
  intents: IntentView[];
  rooms: RoomMiniView[];
  player: PlayerHudView;
  actions: ActionSlotView[];
  logs: CombatLogEntry[];
}
