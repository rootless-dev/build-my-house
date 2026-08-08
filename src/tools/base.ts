import type * as THREE from 'three';
import type { Model } from '../core/model';
import type { EntityRef } from '../core/types';
import type { Inference, Snap } from '../viewer/Inference';
import type { Overlay } from '../viewer/Overlay';
import type { Unit } from '../core/units';

export type ToolId =
  | 'select'
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'polygon'
  | 'arc'
  | 'pushpull'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'offset'
  | 'eraser'
  | 'paint'
  | 'tape'
  | 'dimension'
  | 'text'
  | 'orbit'
  | 'pan';

export interface PointerInfo {
  x: number;
  y: number;
  button: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  raycaster: THREE.Raycaster;
  snap: Snap;
}

/** Services the viewport offers to the tools. */
export interface ToolHost {
  readonly model: Model;
  readonly inference: Inference;
  readonly overlay: Overlay;
  readonly camera: THREE.PerspectiveCamera;
  readonly size: { width: number; height: number };
  readonly unit: Unit;
  readonly polygonSides: number;
  requestRender(): void;
  refreshModel(): void;
  commit(label: string): void;
  status(text: string): void;
  /** Updates the measurement box: displayed value and what it expects. */
  measure(value: string, hint: string): void;
  getSelection(): EntityRef[];
  setSelection(refs: EntityRef[]): void;
  getActiveMaterial(): string | null;
  setActiveMaterial(id: string | null): void;
  setTool(id: ToolId): void;
  toast(message: string): void;
  navigate(kind: 'orbit' | 'pan', dx: number, dy: number): void;
}

export abstract class Tool {
  abstract readonly id: ToolId;
  cursor = 'crosshair';
  protected host: ToolHost;

  constructor(host: ToolHost) {
    this.host = host;
  }

  abstract hint(): string;

  activate(): void {
    this.host.status(this.hint());
  }

  deactivate(): void {
    this.reset();
  }

  reset(): void {
    this.host.inference.reset();
    this.host.overlay.clear();
    this.host.measure('', '');
    this.host.requestRender();
  }

  pointerDown(_p: PointerInfo): void {}
  pointerMove(_p: PointerInfo): void {}
  pointerUp(_p: PointerInfo): void {}
  doubleClick(_p: PointerInfo): void {}
  /** Returns true when the key was consumed. */
  key(_e: KeyboardEvent): boolean {
    return false;
  }
  /** Value confirmed in the measurement box. Returns true when applied. */
  value(_text: string): boolean {
    return false;
  }
  cancel(): void {
    this.reset();
    this.host.status(this.hint());
  }
}

/** Treats the arrow keys as axis locks, the same way SketchUp does. */
export function handleAxisKey(host: ToolHost, e: KeyboardEvent): boolean {
  const map: Record<string, 'x' | 'y' | 'z'> = {
    ArrowRight: 'x',
    ArrowLeft: 'y',
    ArrowUp: 'z',
    ArrowDown: 'z',
  };
  const axis = map[e.key];
  if (!axis) return false;
  host.inference.lockAxis = host.inference.lockAxis === axis ? null : axis;
  host.status(
    host.inference.lockAxis
      ? `Travado no eixo ${axis === 'x' ? 'vermelho' : axis === 'y' ? 'verde' : 'azul'} — seta de novo destrava.`
      : 'Trava de eixo desligada.',
  );
  host.requestRender();
  return true;
}
