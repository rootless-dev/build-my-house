import * as THREE from 'three';

/**
 * Câmera orbital com Z para cima, no esquema do SketchUp:
 *   botão do meio        → orbitar
 *   shift + botão do meio → deslocar (pan)
 *   roda                 → zoom na direção do cursor
 * O alvo é um ponto no espaço; a câmera fica sobre uma esfera ao redor dele.
 */
export class CameraRig {
  camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3(0, 0, 1.2);

  private theta = -Math.PI * 0.75; // azimute
  private phi = Math.PI * 0.35; // inclinação a partir do +Z
  private radius = 22;

  constructor(aspect: number) {
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.05, 8000);
    this.camera.up.set(0, 0, 1);
    this.apply();
  }

  private apply(): void {
    const sinPhi = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sinPhi * Math.cos(this.theta),
      this.target.y + this.radius * sinPhi * Math.sin(this.theta),
      this.target.z + this.radius * Math.cos(this.phi),
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  orbit(dx: number, dy: number): void {
    this.theta -= dx * 0.0075;
    this.phi = THREE.MathUtils.clamp(this.phi - dy * 0.0075, 0.02, Math.PI - 0.02);
    this.apply();
  }

  pan(dx: number, dy: number, viewportHeight: number): void {
    const dist = this.radius;
    const worldPerPixel = (2 * Math.tan((this.camera.fov * Math.PI) / 360) * dist) / viewportHeight;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    this.target.addScaledVector(right, -dx * worldPerPixel);
    this.target.addScaledVector(up, dy * worldPerPixel);
    this.apply();
  }

  /** Zoom que aproxima do ponto sob o cursor, como o scroll do SketchUp. */
  zoom(delta: number, cursorRay?: THREE.Ray): void {
    const factor = Math.exp(delta * 0.0016);
    const newRadius = THREE.MathUtils.clamp(this.radius * factor, 0.15, 4000);
    if (cursorRay) {
      const before = cursorRay.at(this.radius, new THREE.Vector3());
      this.radius = newRadius;
      this.apply();
      const after = cursorRay.at(this.radius, new THREE.Vector3());
      this.target.add(before.sub(after).multiplyScalar(0.55));
    } else {
      this.radius = newRadius;
    }
    this.apply();
  }

  dolly(distance: number): void {
    this.radius = THREE.MathUtils.clamp(distance, 0.15, 4000);
    this.apply();
  }

  frame(box: THREE.Box3, aspect: number): void {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const fov = (this.camera.fov * Math.PI) / 180;
    const distV = maxDim / (2 * Math.tan(fov / 2));
    const distH = maxDim / (2 * Math.tan(Math.atan(Math.tan(fov / 2) * aspect)));
    this.target.copy(center);
    this.radius = Math.max(distV, distH) * 1.5 + 1;
    this.apply();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Vistas padrão de projeto: topo, frente, direita, isométrica. */
  setStandardView(view: 'iso' | 'topo' | 'frente' | 'direita' | 'esquerda' | 'tras'): void {
    const angles: Record<string, [number, number]> = {
      iso: [-Math.PI * 0.75, Math.PI * 0.35],
      topo: [-Math.PI / 2, 0.0001],
      frente: [-Math.PI / 2, Math.PI / 2],
      tras: [Math.PI / 2, Math.PI / 2],
      direita: [0, Math.PI / 2],
      esquerda: [Math.PI, Math.PI / 2],
    };
    const [t, p] = angles[view];
    this.theta = t;
    this.phi = p;
    this.apply();
  }

  get distance(): number {
    return this.radius;
  }
}
