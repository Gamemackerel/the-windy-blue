import * as THREE from 'three';
import { World } from './world';
import { Environment } from './env';
import { Boat } from './boat';
import { GameState } from './state';
import { Input } from './input';

/** Everything a location needs in order to build itself. */
export interface Ctx {
  scene: THREE.Scene;
  world: World;
  env: Environment;
  boat: Boat;
  state: GameState;
  input: Input;
  /** freeze the player while a fixed device has their attention */
  hold: (seconds: number) => void;
  /** world position of the player's offering hand, and of the player */
  playerHand: () => THREE.Vector3;
  playerPos: () => THREE.Vector3;
  /** the item the player is holding out, and a way to take it from them */
  held: () => string | null;
  takeHeld: () => void;
  /** fade to black, run fn, fade back */
  fade: (fn: () => void, hold?: number) => void;
  /** rotate the camera about the vertical axis (used when the floor turns under the player) */
  turnView: (delta: number) => void;
  /** show a page of handwriting full-screen */
  read: (text: string) => void;
  wind: { dir: number; speed: number };
  setHeld: (id: string | null) => void;
  /** the player's eyes */
  view: THREE.Camera;
  /**
   * Pick something up in both hands (or pass null to let go). While carried it is held in front of the
   * player; drop is called if they put it down where there is nothing to put it on.
   */
  setCarry: (c: { obj: THREE.Object3D; size: number; drop: () => void } | null) => void;
  /** put the eye to a fixed instrument (or take it away); done is called when the player steps back */
  scope: (on: boolean, at?: THREE.Vector3, done?: () => void) => void;
  /** where the eye is looking while at an instrument, else null */
  scopeView: () => { yaw: number; pitch: number } | null;
  /** one-shot sound by name at a world position (filled in by the audio system) */
  sfx: (name: string, pos?: THREE.Vector3, gain?: number) => void;
}
