import Phaser from 'phaser';
import { Match3Scene } from './scenes/Match3Scene';
import './styles.css';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#1c2333',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: 720
  },
  render: {
    antialias: true,
    pixelArt: false
  },
  scene: [Match3Scene]
});
