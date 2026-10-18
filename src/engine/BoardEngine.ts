import type {
  Board,
  CollapseMove,
  MatchGroup,
  Position,
  ResolveStep,
  SpecialType,
  SwapResult,
  Tile,
  TileType
} from './types';

const TILE_TYPES: TileType[] = ['heart', 'star', 'drop', 'leaf', 'moon', 'gem'];

export class BoardEngine {
  readonly rows: number;
  readonly cols: number;
  private readonly types: TileType[];
  private nextId = 1;

  board: Board = [];
  score = 0;
  movesLeft = 25;
  targetScore = 1800;

  constructor(rows = 8, cols = 8, types = TILE_TYPES) {
    this.rows = rows;
    this.cols = cols;
    this.types = types;
    this.reset();
  }

  reset(): void {
    this.nextId = 1;
    this.score = 0;
    this.movesLeft = 25;
    this.targetScore = 1800;
    this.board = Array.from({ length: this.rows }, (_, row) =>
      Array.from({ length: this.cols }, (_, col) => this.createTile(row, col, true))
    );

    let guard = 0;
    while ((!this.hasAvailableMove() || this.findMatches().length > 0) && guard < 50) {
      this.board = Array.from({ length: this.rows }, (_, row) =>
        Array.from({ length: this.cols }, (_, col) => this.createTile(row, col, true))
      );
      guard += 1;
    }
  }

  getTile(position: Position): Tile | null {
    if (!this.isInside(position)) {
      return null;
    }
    return this.board[position.row][position.col];
  }

  trySwap(a: Position, b: Position): SwapResult {
    if (this.movesLeft <= 0 || !this.areAdjacent(a, b)) {
      return { accepted: false, steps: [] };
    }

    this.swapTiles(a, b);
    const matches = this.findMatches();
    if (matches.length === 0) {
      this.swapTiles(a, b);
      return { accepted: false, steps: [] };
    }

    this.movesLeft -= 1;
    const steps = this.resolveBoard(b);
    return { accepted: true, steps };
  }

  findMatches(): MatchGroup[] {
    const groups: MatchGroup[] = [];

    for (let row = 0; row < this.rows; row += 1) {
      let col = 0;
      while (col < this.cols) {
        const tile = this.board[row][col];
        if (!tile) {
          col += 1;
          continue;
        }

        const start = col;
        while (col < this.cols && this.board[row][col]?.type === tile.type) {
          col += 1;
        }

        if (col - start >= 3) {
          groups.push({
            type: tile.type,
            direction: 'horizontal',
            positions: Array.from({ length: col - start }, (_, offset) => ({ row, col: start + offset }))
          });
        }
      }
    }

    for (let col = 0; col < this.cols; col += 1) {
      let row = 0;
      while (row < this.rows) {
        const tile = this.board[row][col];
        if (!tile) {
          row += 1;
          continue;
        }

        const start = row;
        while (row < this.rows && this.board[row][col]?.type === tile.type) {
          row += 1;
        }

        if (row - start >= 3) {
          groups.push({
            type: tile.type,
            direction: 'vertical',
            positions: Array.from({ length: row - start }, (_, offset) => ({ row: start + offset, col }))
          });
        }
      }
    }

    return groups;
  }

  hasAvailableMove(): boolean {
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const current = { row, col };
        const right = { row, col: col + 1 };
        const down = { row: row + 1, col };

        if (this.canProduceMatch(current, right) || this.canProduceMatch(current, down)) {
          return true;
        }
      }
    }
    return false;
  }

  validSwapTargets(position: Position): Position[] {
    const neighbors = [
      { row: position.row - 1, col: position.col },
      { row: position.row + 1, col: position.col },
      { row: position.row, col: position.col - 1 },
      { row: position.row, col: position.col + 1 }
    ];

    return neighbors.filter((neighbor) => this.canProduceMatch(position, neighbor));
  }

  shuffleUntilPlayable(): ResolveStep[] {
    let guard = 0;
    do {
      const existing = this.board.flat().filter(Boolean) as Tile[];
      const types = existing.map((tile) => tile.type).sort(() => Math.random() - 0.5);
      for (let row = 0; row < this.rows; row += 1) {
        for (let col = 0; col < this.cols; col += 1) {
          const tile = this.board[row][col];
          if (tile) {
            tile.type = types.pop() ?? this.randomType();
            tile.special = undefined;
          }
        }
      }
      guard += 1;
    } while ((!this.hasAvailableMove() || this.findMatches().length > 0) && guard < 80);

    return [];
  }

  private resolveBoard(origin: Position): ResolveStep[] {
    const steps: ResolveStep[] = [];
    let chain = 0;

    while (true) {
      const matches = this.findMatches();
      if (matches.length === 0) {
        break;
      }

      const createdSpecials = this.createSpecials(matches, origin);
      const removed = this.removeMatches(matches, createdSpecials);
      const moves = this.collapseColumns();
      const spawned = this.refill();
      const score = this.calculateScore(matches, chain);
      this.score += score;

      steps.push({ matches, removed, createdSpecials, moves, spawned, score });
      chain += 1;
    }

    if (!this.hasAvailableMove()) {
      this.shuffleUntilPlayable();
    }

    return steps;
  }

  private createSpecials(matches: MatchGroup[], origin: Position): Tile[] {
    const specials: Tile[] = [];
    const occupied = new Set<string>();

    for (const match of matches) {
      if (match.positions.length < 4) {
        continue;
      }

      const anchor = this.pickSpecialAnchor(match.positions, origin);
      const key = this.key(anchor);
      if (occupied.has(key)) {
        continue;
      }

      const tile = this.getTile(anchor);
      if (!tile) {
        continue;
      }

      tile.special = this.pickSpecialType(match);
      specials.push(tile);
      occupied.add(key);
    }

    return specials;
  }

  private removeMatches(matches: MatchGroup[], createdSpecials: Tile[]): Position[] {
    const keep = new Set(createdSpecials.map((tile) => this.key(tile)));
    const removal = new Map<string, Position>();

    for (const match of matches) {
      for (const position of match.positions) {
        if (!keep.has(this.key(position))) {
          removal.set(this.key(position), position);
        }
      }
    }

    for (const position of removal.values()) {
      const tile = this.getTile(position);
      if (!tile) {
        continue;
      }
      if (tile.special === 'lineH') {
        for (let col = 0; col < this.cols; col += 1) {
          removal.set(this.key({ row: tile.row, col }), { row: tile.row, col });
        }
      }
      if (tile.special === 'lineV') {
        for (let row = 0; row < this.rows; row += 1) {
          removal.set(this.key({ row, col: tile.col }), { row, col: tile.col });
        }
      }
      if (tile.special === 'bomb') {
        for (let row = Math.max(0, tile.row - 1); row <= Math.min(this.rows - 1, tile.row + 1); row += 1) {
          for (let col = Math.max(0, tile.col - 1); col <= Math.min(this.cols - 1, tile.col + 1); col += 1) {
            removal.set(this.key({ row, col }), { row, col });
          }
        }
      }
    }

    for (const position of removal.values()) {
      if (!keep.has(this.key(position))) {
        this.board[position.row][position.col] = null;
      }
    }

    return [...removal.values()].filter((position) => !keep.has(this.key(position)));
  }

  private collapseColumns(): CollapseMove[] {
    const moves: CollapseMove[] = [];

    for (let col = 0; col < this.cols; col += 1) {
      let writeRow = this.rows - 1;
      for (let row = this.rows - 1; row >= 0; row -= 1) {
        const tile = this.board[row][col];
        if (!tile) {
          continue;
        }

        if (row !== writeRow) {
          this.board[writeRow][col] = tile;
          this.board[row][col] = null;
          moves.push({ tile, from: { row, col }, to: { row: writeRow, col } });
          tile.row = writeRow;
          tile.col = col;
        }
        writeRow -= 1;
      }
    }

    return moves;
  }

  private refill(): Tile[] {
    const spawned: Tile[] = [];
    for (let col = 0; col < this.cols; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        if (!this.board[row][col]) {
          const tile = this.createTile(row, col, false);
          this.board[row][col] = tile;
          spawned.push(tile);
        }
      }
    }
    return spawned;
  }

  private canProduceMatch(a: Position, b: Position): boolean {
    if (!this.isInside(a) || !this.isInside(b)) {
      return false;
    }

    this.swapTiles(a, b);
    const result = this.findMatches().length > 0;
    this.swapTiles(a, b);
    return result;
  }

  private swapTiles(a: Position, b: Position): void {
    const tileA = this.board[a.row][a.col];
    const tileB = this.board[b.row][b.col];

    this.board[a.row][a.col] = tileB;
    this.board[b.row][b.col] = tileA;

    if (tileA) {
      tileA.row = b.row;
      tileA.col = b.col;
    }
    if (tileB) {
      tileB.row = a.row;
      tileB.col = a.col;
    }
  }

  private createTile(row: number, col: number, avoidImmediateMatch: boolean): Tile {
    let type = this.randomType();
    let guard = 0;

    while (avoidImmediateMatch && guard < 20) {
      const horizontal =
        col >= 2 && this.board[row]?.[col - 1]?.type === type && this.board[row]?.[col - 2]?.type === type;
      const vertical =
        row >= 2 && this.board[row - 1]?.[col]?.type === type && this.board[row - 2]?.[col]?.type === type;
      if (!horizontal && !vertical) {
        break;
      }
      type = this.randomType();
      guard += 1;
    }

    return { id: this.nextId++, type, row, col };
  }

  private randomType(): TileType {
    return this.types[Math.floor(Math.random() * this.types.length)];
  }

  private pickSpecialAnchor(positions: Position[], origin: Position): Position {
    return positions.find((position) => position.row === origin.row && position.col === origin.col) ?? positions[1];
  }

  private pickSpecialType(match: MatchGroup): SpecialType {
    if (match.positions.length >= 5) {
      return 'bomb';
    }
    return match.direction === 'horizontal' ? 'lineH' : 'lineV';
  }

  private calculateScore(matches: MatchGroup[], chain: number): number {
    const removedCount = matches.reduce((sum, match) => sum + match.positions.length, 0);
    return removedCount * 60 + chain * 120 + matches.length * 40;
  }

  private areAdjacent(a: Position, b: Position): boolean {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
  }

  private isInside(position: Position): boolean {
    return position.row >= 0 && position.row < this.rows && position.col >= 0 && position.col < this.cols;
  }

  private key(position: Position): string {
    return `${position.row}:${position.col}`;
  }
}
