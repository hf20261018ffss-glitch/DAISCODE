export type TileType = 'heart' | 'star' | 'drop' | 'leaf' | 'moon' | 'gem';

export type SpecialType = 'lineH' | 'lineV' | 'bomb';

export interface Position {
  row: number;
  col: number;
}

export interface Tile extends Position {
  id: number;
  type: TileType;
  special?: SpecialType;
}

export type Board = Array<Array<Tile | null>>;

export interface MatchGroup {
  type: TileType;
  positions: Position[];
  direction: 'horizontal' | 'vertical';
}

export interface CollapseMove {
  tile: Tile;
  from: Position;
  to: Position;
}

export interface ResolveStep {
  matches: MatchGroup[];
  removed: Position[];
  createdSpecials: Tile[];
  moves: CollapseMove[];
  spawned: Tile[];
  score: number;
}

export interface SwapResult {
  accepted: boolean;
  steps: ResolveStep[];
}
