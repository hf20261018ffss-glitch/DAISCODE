import Phaser from 'phaser';
import { BoardEngine } from '../engine/BoardEngine';
import type { Position, SpecialType, Tile, TileType } from '../engine/types';

const TILE_SIZE = 64;
const TILE_GAP = 8;
const BOARD_OFFSET_X = 76;
const BOARD_OFFSET_Y = 86;

const TILE_STYLE: Record<TileType, { color: number; icon: string }> = {
  heart: { color: 0xf0647d, icon: 'H' },
  star: { color: 0xf4c542, icon: 'S' },
  drop: { color: 0x4aa3ff, icon: 'D' },
  leaf: { color: 0x35b779, icon: 'L' },
  moon: { color: 0x8c78ff, icon: 'M' },
  gem: { color: 0xff8d4a, icon: 'G' }
};

type TileView = Phaser.GameObjects.Container & {
  tileId: number;
  gridPosition: Position;
};

export class Match3Scene extends Phaser.Scene {
  private engine = new BoardEngine();
  private selected: Position | null = null;
  private busy = false;
  private tileViews = new Map<number, TileView>();
  private selectionRing?: Phaser.GameObjects.Graphics;
  private pointerStart?: { x: number; y: number };

  constructor() {
    super('Match3Scene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c2333');
    this.drawBoardBackground();
    this.renderBoard();
    this.updateHud('交换相邻方块，消除三个及以上同色元素。');

    document.getElementById('restart')?.addEventListener('click', () => {
      this.restartLevel();
    });
  }

  private restartLevel(): void {
    this.selected = null;
    this.busy = false;
    this.engine.reset();
    this.clearTileViews();
    this.renderBoard();
    this.updateHud('新一局开始。');
  }

  private drawBoardBackground(): void {
    const width = this.engine.cols * TILE_SIZE + (this.engine.cols - 1) * TILE_GAP;
    const height = this.engine.rows * TILE_SIZE + (this.engine.rows - 1) * TILE_GAP;

    const bg = this.add.graphics();
    bg.fillStyle(0x263149, 1);
    bg.fillRoundedRect(BOARD_OFFSET_X - 18, BOARD_OFFSET_Y - 18, width + 36, height + 36, 24);
    bg.lineStyle(2, 0xffffff, 0.12);
    bg.strokeRoundedRect(BOARD_OFFSET_X - 18, BOARD_OFFSET_Y - 18, width + 36, height + 36, 24);
  }

  private renderBoard(): void {
    this.clearTileViews();

    for (let row = 0; row < this.engine.rows; row += 1) {
      for (let col = 0; col < this.engine.cols; col += 1) {
        const tile = this.engine.board[row][col];
        if (!tile) {
          continue;
        }
        this.createTileView(tile, { row, col });
      }
    }
  }

  private clearTileViews(): void {
    this.tileViews.forEach((view) => view.destroy());
    this.tileViews.clear();
    this.selectionRing?.destroy();
    this.selectionRing = undefined;
  }

  private createTileView(tile: Tile, position: Position): TileView {
    const { x, y } = this.cellToPoint(position);
    const style = TILE_STYLE[tile.type];
    const container = this.add.container(x, y) as TileView;
    container.tileId = tile.id;
    container.gridPosition = { ...position };
    container.setSize(TILE_SIZE, TILE_SIZE);
    container.setInteractive({ useHandCursor: true });

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.14);
    shadow.fillRoundedRect(-TILE_SIZE / 2 + 3, -TILE_SIZE / 2 + 5, TILE_SIZE - 2, TILE_SIZE - 2, 16);

    const tileShape = this.add.graphics();
    tileShape.fillStyle(style.color, 1);
    tileShape.fillRoundedRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 16);
    tileShape.lineStyle(3, 0xffffff, 0.32);
    tileShape.strokeRoundedRect(-TILE_SIZE / 2 + 2, -TILE_SIZE / 2 + 2, TILE_SIZE - 4, TILE_SIZE - 4, 14);

    const icon = this.add.text(0, -1, style.icon, {
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontSize: '28px',
      fontStyle: '700'
    });
    icon.setOrigin(0.5);

    container.add([shadow, tileShape, icon]);

    if (tile.special) {
      container.add(this.createSpecialBadge(tile.special));
    }

    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerStart = { x: pointer.x, y: pointer.y };
    });
    container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const start = this.pointerStart;
      this.pointerStart = undefined;
      if (!start) {
        this.handleTilePointer(position);
        return;
      }

      const target = this.pointToNeighbor(position, pointer.x - start.x, pointer.y - start.y);
      if (target) {
        void this.trySwap(position, target);
      } else {
        this.handleTilePointer(position);
      }
    });

    this.tileViews.set(tile.id, container);
    return container;
  }

  private createSpecialBadge(special: SpecialType): Phaser.GameObjects.Container {
    const badge = this.add.container(18, -20);
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.92);
    bg.fillCircle(0, 0, 11);
    const label = special === 'bomb' ? 'B' : special === 'lineH' ? '-' : '|';
    const text = this.add.text(0, -1, label, {
      color: '#1f2937',
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      fontStyle: '700'
    });
    text.setOrigin(0.5);
    badge.add([bg, text]);
    return badge;
  }

  private handleTilePointer(position: Position): void {
    if (this.busy || this.engine.movesLeft <= 0) {
      return;
    }

    if (!this.selected) {
      const validTargets = this.engine.validSwapTargets(position);
      if (validTargets.length === 1) {
        void this.trySwap(position, validTargets[0]);
        return;
      }
      this.select(position);
      return;
    }

    const previous = this.selected;
    if (previous.row === position.row && previous.col === position.col) {
      this.clearSelection();
      return;
    }

    void this.trySwap(previous, position);
  }

  private select(position: Position): void {
    this.selected = { ...position };
    this.selectionRing?.destroy();

    const { x, y } = this.cellToPoint(position);
    this.selectionRing = this.add.graphics();
    this.selectionRing.lineStyle(4, 0xffffff, 0.92);
    this.selectionRing.strokeRoundedRect(x - TILE_SIZE / 2 - 5, y - TILE_SIZE / 2 - 5, TILE_SIZE + 10, TILE_SIZE + 10, 18);
  }

  private clearSelection(): void {
    this.selected = null;
    this.selectionRing?.destroy();
    this.selectionRing = undefined;
  }

  private async trySwap(a: Position, b: Position): Promise<void> {
    if (this.busy) {
      return;
    }
    if (Math.abs(a.row - b.row) + Math.abs(a.col - b.col) !== 1) {
      this.select(b);
      return;
    }

    const viewA = this.findViewAt(a);
    const viewB = this.findViewAt(b);
    if (!viewA || !viewB) {
      return;
    }

    this.busy = true;
    this.clearSelection();
    await this.animateSwap(viewA, viewB);

    const result = this.engine.trySwap(a, b);
    if (!result.accepted) {
      await this.animateSwap(viewA, viewB);
      this.updateHud('这一步不能形成消除。');
      this.busy = false;
      return;
    }

    viewA.gridPosition = { ...b };
    viewB.gridPosition = { ...a };

    const gained = result.steps.reduce((sum, step) => sum + step.score, 0);
    await this.playResolveFeedback(result.steps.flatMap((step) => step.removed));
    this.renderBoard();
    this.updateHud(gained > 0 ? `本次获得 ${gained} 分。` : '继续寻找可消除组合。');
    this.checkEndState();
    this.busy = false;
  }

  private async animateSwap(viewA: TileView, viewB: TileView): Promise<void> {
    const ax = viewA.x;
    const ay = viewA.y;
    const bx = viewB.x;
    const by = viewB.y;

    await new Promise<void>((resolve) => {
      let completed = 0;
      const onComplete = () => {
        completed += 1;
        if (completed === 2) {
          resolve();
        }
      };
      this.tweens.add({ targets: viewA, x: bx, y: by, duration: 140, ease: 'Sine.easeInOut', onComplete });
      this.tweens.add({ targets: viewB, x: ax, y: ay, duration: 140, ease: 'Sine.easeInOut', onComplete });
    });
  }

  private async playResolveFeedback(removed: Position[]): Promise<void> {
    const removedViews = removed.map((position) => this.findViewAt(position)).filter(Boolean) as TileView[];
    if (removedViews.length === 0) {
      await this.delay(160);
      return;
    }

    await new Promise<void>((resolve) => {
      let done = 0;
      for (const view of removedViews) {
        this.tweens.add({
          targets: view,
          scale: 0.2,
          alpha: 0,
          angle: 14,
          duration: 180,
          ease: 'Back.easeIn',
          onComplete: () => {
            done += 1;
            if (done === removedViews.length) {
              resolve();
            }
          }
        });
      }
    });
  }

  private checkEndState(): void {
    if (this.engine.score >= this.engine.targetScore) {
      this.updateHud('目标达成，通关成功！');
      this.busy = true;
      return;
    }

    if (this.engine.movesLeft <= 0) {
      this.updateHud('步数用完，点击重新开始再试一次。');
      this.busy = true;
    }
  }

  private updateHud(message: string): void {
    this.setText('score', String(this.engine.score));
    this.setText('moves', String(this.engine.movesLeft));
    this.setText('target', String(this.engine.targetScore));
    this.setText('status', message);
  }

  private setText(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  private findViewAt(position: Position): TileView | undefined {
    return [...this.tileViews.values()].find(
      (view) => view.gridPosition.row === position.row && view.gridPosition.col === position.col
    );
  }

  private cellToPoint(position: Position): { x: number; y: number } {
    return {
      x: BOARD_OFFSET_X + position.col * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
      y: BOARD_OFFSET_Y + position.row * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2
    };
  }

  private pointToNeighbor(origin: Position, dx: number, dy: number): Position | null {
    const threshold = 24;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      return null;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      return this.inBounds({ row: origin.row, col: origin.col + (dx > 0 ? 1 : -1) });
    }

    return this.inBounds({ row: origin.row + (dy > 0 ? 1 : -1), col: origin.col });
  }

  private inBounds(position: Position): Position | null {
    if (position.row < 0 || position.row >= this.engine.rows || position.col < 0 || position.col >= this.engine.cols) {
      return null;
    }
    return position;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, resolve);
    });
  }
}
