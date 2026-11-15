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
  /** one-shot sound by name at a world position (filled in by the audio system) */
  sfx: (name: string, pos?: THREE.Vector3, gain?: number) => void;
}
