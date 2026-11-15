import * as THREE from 'three';
import { World } from './world';
import { Environment } from './env';
import { Boat } from './boat';
import { GameState } from './state';

/** Everything a location needs in order to build itself. */
export interface Ctx {
  scene: THREE.Scene;
  world: World;
  env: Environment;
  boat: Boat;
  state: GameState;
  /** world position of the player's offering hand, and of the player */
  playerHand: () => THREE.Vector3;
  playerPos: () => THREE.Vector3;
  /** the item the player is holding out, and a way to take it from them */
  held: () => string | null;
  takeHeld: () => void;
  /** one-shot sound by name at a world position (filled in by the audio system) */
  sfx: (name: string, pos?: THREE.Vector3, gain?: number) => void;
}
