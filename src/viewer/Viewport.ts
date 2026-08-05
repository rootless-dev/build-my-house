import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { CameraRig } from './CameraRig';
import { ModelView } from './ModelView';
import { Overlay, AXIS_COLORS } from './Overlay';
import { Inference } from './Inference';
import { refKey } from './annotations';
import { model, useApp } from '../state/store';
import type { EntityRef } from '../core/types';
import type { PointerInfo, Tool, ToolHost, ToolId } from '../tools/base';
import { ArcoTool, CirculoTool, LinhaTool, PoligonoTool, RetanguloTool } from '../tools/draw';
import { DeslocarTool, EmpurrarTool, EscalaTool, GirarTool, MoverTool } from '../tools/modify';
import { BorrachaTool, OrbitarTool, PanTool, PintarTool, SelecionarTool, TrenaTool } from '../tools/utility';
import { CotarTool, TextoTool } from '../tools/annotate';
import type { Vec3 } from '../core/math';

const GROUND_SIZE = 400;

function skyTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#b9d2e8');
  g.addColorStop(0.48, '#dce8f2');
  g.addColorStop(0.52, '#efeee9');
  g.addColorStop(1, '#cfc9bd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

export class Viewport implements ToolHost {
  readonly model = model;
  readonly inference: Inference;
  readonly overlay = new Overlay();

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private rig: CameraRig;
  private modelView = new ModelView();
  private raycaster = new THREE.Raycaster();
  private container: HTMLElement;
  private hud: HTMLDivElement;
  private marker: HTMLDivElement;
  private markerLabel: HTMLDivElement;
  private labelLayer!: HTMLDivElement;
  private labelEls = new Map<string, HTMLElement>();
  private tools = new Map<ToolId, Tool>();
  private current!: Tool;
  private dirty = true;
  private frame = 0;
  private nav: { mode: 'orbit' | 'pan'; x: number; y: number } | null = null;
  private sun!: THREE.DirectionalLight;
  private groundGroup = new THREE.Group();

  constructor(container: HTMLElement) {
    this.container = container;
    const { clientWidth: w, clientHeight: h } = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('viewport-canvas');

    this.rig = new CameraRig(w / Math.max(1, h));
    this.scene.background = new THREE.Color('#e4ebf1');
    this.scene.environment = skyTexture();

    this.buildLights();
    this.buildGround();
    this.scene.add(this.modelView.group);
    this.scene.add(this.overlay.group);

    this.inference = new Inference(model, this.modelView);

    // HUD imperativo: marcador de inferência e etiqueta, fora do React.
    this.hud = document.createElement('div');
    this.hud.className = 'viewport-hud';
    this.marker = document.createElement('div');
    this.marker.className = 'snap-marker';
    this.markerLabel = document.createElement('div');
    this.markerLabel.className = 'snap-label';
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'label-layer';
    this.hud.append(this.labelLayer, this.marker, this.markerLabel);
    container.appendChild(this.hud);

    this.registerTools();
    this.setTool(useApp.getState().tool);
    this.attachEvents();
    this.refreshModel();
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------- cena

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xdceaf7, 0xa89c88, 1.5);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.1);
    sun.name = 'sol';
    sun.position.set(16, -26, 34);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    const s = 40;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  private buildGround(): void {
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.z = -0.004;
    ground.receiveShadow = true;
    this.groundGroup.add(ground);

    const minor: number[] = [];
    const major: number[] = [];
    const half = 60;
    for (let i = -half; i <= half; i++) {
      const target = i % 10 === 0 ? major : minor;
      target.push(i, -half, 0, i, half, 0, -half, i, 0, half, i, 0);
    }
    const mkGrid = (coords: number[], color: number, opacity: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      const lines = new THREE.LineSegments(g, m);
      lines.position.z = -0.002;
      return lines;
    };
    this.groundGroup.add(mkGrid(minor, 0x9aa3ad, 0.24));
    this.groundGroup.add(mkGrid(major, 0x6c7783, 0.34));

    // eixos do modelo, no estilo do SketchUp
    const axisLen = 30;
    const mkAxis = (dir: Vec3, color: number, dashed: boolean) => {
      const geo2 = new LineSegmentsGeometry();
      geo2.setPositions([0, 0, 0, dir[0] * axisLen, dir[1] * axisLen, dir[2] * axisLen]);
      const m = new LineMaterial({
        color,
        linewidth: dashed ? 1.2 : 2,
        dashed,
        dashSize: 0.4,
        gapSize: 0.28,
        transparent: true,
        opacity: dashed ? 0.5 : 0.9,
      });
      const line = new LineSegments2(geo2, m);
      line.computeLineDistances();
      line.frustumCulled = false;
      this.axisMaterials.push(m);
      return line;
    };
    this.groundGroup.add(mkAxis([1, 0, 0], AXIS_COLORS.x, false), mkAxis([-1, 0, 0], AXIS_COLORS.x, true));
    this.groundGroup.add(mkAxis([0, 1, 0], AXIS_COLORS.y, false), mkAxis([0, -1, 0], AXIS_COLORS.y, true));
    this.groundGroup.add(mkAxis([0, 0, 1], AXIS_COLORS.z, false), mkAxis([0, 0, -1], AXIS_COLORS.z, true));

    this.scene.add(this.groundGroup);
  }

  private axisMaterials: LineMaterial[] = [];

  // -------------------------------------------------------------- ferramentas

  private registerTools(): void {
    const list: Tool[] = [
      new SelecionarTool(this),
      new LinhaTool(this),
      new RetanguloTool(this),
      new CirculoTool(this),
      new PoligonoTool(this),
      new ArcoTool(this),
      new EmpurrarTool(this),
      new MoverTool(this),
      new GirarTool(this),
      new EscalaTool(this),
      new DeslocarTool(this),
      new BorrachaTool(this),
      new PintarTool(this),
      new TrenaTool(this),
      new CotarTool(this),
      new TextoTool(this),
      new OrbitarTool(this),
      new PanTool(this),
    ];
    for (const t of list) this.tools.set(t.id, t);
  }

  setTool(id: ToolId): void {
    const next = this.tools.get(id);
    if (!next || next === this.current) return;
    this.current?.deactivate();
    this.current = next;
    this.inference.reset();
    this.overlay.clear();
    this.renderer.domElement.style.cursor = next.cursor;
    next.activate();
    if (useApp.getState().tool !== id) useApp.getState().setTool(id);
    this.requestRender();
  }

  /** Aborta a operação em andamento — usado quando o modelo é trocado. */
  cancelTool(): void {
    this.current?.cancel();
    this.inference.reset();
    this.overlay.clear();
    this.requestRender();
  }

  // ------------------------------------------------------------- ToolHost API

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  get size(): { width: number; height: number } {
    return { width: this.container.clientWidth, height: this.container.clientHeight };
  }

  get unit() {
    return useApp.getState().unit;
  }

  get polygonSides(): number {
    return useApp.getState().polygonSides;
  }

  requestRender(): void {
    this.dirty = true;
  }

  refreshModel(): void {
    const state = useApp.getState();
    const faces = new Set<string>();
    const edges = new Set<number>();
    const annotations = new Set<string>();
    for (const ref of state.selection) {
      if (ref.kind === 'face') faces.add(ref.key);
      else if (ref.kind === 'edge') edges.add(ref.id);
      else if (ref.kind === 'cota' || ref.kind === 'texto' || ref.kind === 'guia') {
        annotations.add(refKey(ref.kind, ref.id));
      }
    }
    this.modelView.build(model, {
      style: state.style,
      selection: faces,
      selectedEdges: edges,
      selectedAnnotations: annotations,
      showHidden: state.showHidden,
      showGuides: state.showGuides,
      unit: state.unit,
    });
    this.syncLabels();
    this.groundGroup.visible = state.showGrid;
    if (this.sun) this.sun.castShadow = state.showShadows;
    this.renderer.shadowMap.enabled = state.showShadows;
    this.requestRender();
  }

  commit(label: string): void {
    useApp.getState().commit(label);
  }

  status(text: string): void {
    useApp.getState().setStatus(text);
  }

  measure(value: string, hint: string): void {
    useApp.getState().setMeasure(value, hint);
  }

  getSelection(): EntityRef[] {
    return useApp.getState().selection;
  }

  setSelection(refs: EntityRef[]): void {
    useApp.getState().setSelection(refs);
    this.refreshModel();
  }

  getActiveMaterial(): string | null {
    return useApp.getState().activeMaterial;
  }

  setActiveMaterial(id: string | null): void {
    useApp.getState().setActiveMaterial(id);
  }

  toast(message: string): void {
    useApp.getState().pushToast(message);
  }

  navigate(kind: 'orbit' | 'pan', dx: number, dy: number): void {
    if (kind === 'orbit') this.rig.orbit(dx, dy);
    else this.rig.pan(dx, dy, this.size.height);
    this.requestRender();
  }

  // ------------------------------------------------------------------ eventos

  private attachEvents(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('dblclick', this.onDoubleClick);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
  }

  private pointerInfo(e: PointerEvent): PointerInfo {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const snap = this.inference.resolve(this.raycaster, new THREE.Vector2(x, y), this.camera, {
      width: rect.width,
      height: rect.height,
    });
    this.updateMarker(snap.point, snap.color, snap.label);
    return { x, y, button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, raycaster: this.raycaster, snap };
  }

  private onPointerDown = (e: PointerEvent): void => {
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético (testes) não pode ser capturado */
    }
    const navMode = e.button === 1 ? (e.shiftKey ? 'pan' : 'orbit') : e.button === 2 ? 'pan' : e.altKey && e.button === 0 ? 'orbit' : null;
    if (navMode) {
      this.nav = { mode: navMode, x: e.clientX, y: e.clientY };
      this.renderer.domElement.style.cursor = navMode === 'orbit' ? 'grabbing' : 'move';
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    this.current.pointerDown(this.pointerInfo(e));
    this.requestRender();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.nav) {
      this.navigate(this.nav.mode, e.clientX - this.nav.x, e.clientY - this.nav.y);
      this.nav.x = e.clientX;
      this.nav.y = e.clientY;
      return;
    }
    this.current.pointerMove(this.pointerInfo(e));
    this.requestRender();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.nav) {
      this.nav = null;
      this.renderer.domElement.style.cursor = this.current.cursor;
      return;
    }
    if (e.button !== 0) return;
    this.current.pointerUp(this.pointerInfo(e));
    this.requestRender();
  };

  private onDoubleClick = (e: PointerEvent | MouseEvent): void => {
    this.current.doubleClick(this.pointerInfo(e as PointerEvent));
    this.requestRender();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    this.rig.zoom(e.deltaY, this.raycaster.ray);
    this.requestRender();
  };

  private shortcuts: Record<string, ToolId> = {
    ' ': 'selecionar',
    l: 'linha',
    r: 'retangulo',
    c: 'circulo',
    g: 'poligono',
    a: 'arco',
    p: 'empurrar',
    m: 'mover',
    q: 'girar',
    s: 'escala',
    f: 'deslocar',
    e: 'borracha',
    b: 'pintar',
    t: 'trena',
    d: 'cotar',
    x: 'texto',
    o: 'orbitar',
    h: 'pan',
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) useApp.getState().redo();
      else useApp.getState().undo();
      this.refreshModel();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      useApp.getState().redo();
      this.refreshModel();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const refs: EntityRef[] = [
        ...[...model.edges.keys()].map((id) => ({ kind: 'edge', id }) as EntityRef),
        ...model.faces().map((f) => ({ kind: 'face', key: f.key }) as EntityRef),
      ];
      this.setSelection(refs);
      return;
    }
    if (this.current.key(e)) {
      e.preventDefault();
      this.requestRender();
      return;
    }
    if (e.key === 'Escape') {
      this.current.cancel();
      this.setSelection([]);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelection();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tool = this.shortcuts[e.key.toLowerCase()];
    if (tool) {
      e.preventDefault();
      this.setTool(tool);
    }
  };

  deleteSelection(): void {
    const refs = useApp.getState().selection;
    if (!refs.length) return;
    for (const ref of refs) {
      if (ref.kind === 'edge') model.deleteEdge(ref.id);
      else if (ref.kind === 'face') model.deleteFace(ref.key);
      else model.deleteAnnotation(ref);
    }
    useApp.getState().setSelection([]);
    this.refreshModel();
    this.commit('Apagar seleção');
  }

  // ---------------------------------------------------------------- etiquetas

  /** Reconstrói os elementos DOM das cotas e textos a partir do modelo. */
  private syncLabels(): void {
    const specs = this.modelView.labels;
    const keep = new Set(specs.map((s) => s.key));
    for (const [key, el] of this.labelEls) {
      if (!keep.has(key)) {
        el.remove();
        this.labelEls.delete(key);
      }
    }
    for (const spec of specs) {
      let el = this.labelEls.get(spec.key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'annotation-label';
        el.dataset.key = spec.key;
        el.tabIndex = 0;
        el.addEventListener('pointerdown', this.onLabelPointerDown);
        el.addEventListener('dblclick', this.onLabelDoubleClick);
        this.labelLayer.appendChild(el);
        this.labelEls.set(spec.key, el);
      }
      if (el.textContent !== spec.text) el.textContent = spec.text;
      el.classList.toggle('annotation-label--on', spec.selected);
      el.classList.toggle('annotation-label--nota', spec.kind === 'texto');
    }
    this.positionLabels();
  }

  private positionLabels(): void {
    if (!this.labelEls.size) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    for (const spec of this.modelView.labels) {
      const el = this.labelEls.get(spec.key);
      if (!el) continue;
      v.set(spec.pos[0], spec.pos[1], spec.pos[2]).project(this.camera);
      if (v.z > 1) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      el.style.transform = `translate(${((v.x + 1) / 2) * rect.width}px, ${((1 - v.y) / 2) * rect.height}px) translate(-50%, -50%)`;
    }
  }

  private labelRef(key: string): EntityRef | null {
    const [kind, raw] = key.split(':');
    const id = Number(raw);
    if (kind === 'cota' || kind === 'texto' || kind === 'guia') return { kind, id } as EntityRef;
    return null;
  }

  private onLabelPointerDown = (e: PointerEvent): void => {
    e.stopPropagation();
    e.preventDefault();
    const key = (e.currentTarget as HTMLElement).dataset.key;
    const ref = key ? this.labelRef(key) : null;
    if (!ref) return;
    if (useApp.getState().tool === 'borracha') {
      model.deleteAnnotation(ref);
      this.refreshModel();
      this.commit('Apagar anotação');
      return;
    }
    const current = useApp.getState().selection;
    const already = current.some((r) => r.kind === ref.kind && 'id' in r && r.id === (ref as { id: number }).id);
    if (e.shiftKey) {
      this.setSelection(already ? current.filter((r) => !(r.kind === ref.kind && 'id' in r && r.id === (ref as { id: number }).id)) : [...current, ref]);
    } else {
      this.setSelection([ref]);
    }
  };

  private onLabelDoubleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    const key = (e.currentTarget as HTMLElement).dataset.key;
    const ref = key ? this.labelRef(key) : null;
    if (!ref || ref.kind !== 'texto') return;
    const note = model.notes.get(ref.id);
    if (!note) return;
    const el = e.currentTarget as HTMLElement;
    el.contentEditable = 'true';
    el.classList.add('annotation-label--editando');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const finish = () => {
      el.contentEditable = 'false';
      el.classList.remove('annotation-label--editando');
      el.removeEventListener('blur', finish);
      el.removeEventListener('keydown', onKey);
      const texto = (el.textContent ?? '').trim();
      if (texto && texto !== note.text) {
        model.setNoteText(note.id, texto);
        this.refreshModel();
        this.commit('Editar texto');
      } else {
        el.textContent = note.text;
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        ev.preventDefault();
        el.blur();
      }
      if (ev.key === 'Escape') {
        el.textContent = note.text;
        el.blur();
      }
    };
    el.addEventListener('blur', finish);
    el.addEventListener('keydown', onKey);
  };

  // -------------------------------------------------------------------- HUD

  private updateMarker(point: Vec3, color: number, label: string): void {
    const v = new THREE.Vector3(point[0], point[1], point[2]).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((v.x + 1) / 2) * rect.width;
    const y = ((1 - v.y) / 2) * rect.height;
    const css = `#${color.toString(16).padStart(6, '0')}`;
    this.marker.style.transform = `translate(${x}px, ${y}px)`;
    this.marker.style.borderColor = css;
    this.markerLabel.style.transform = `translate(${x + 16}px, ${y + 10}px)`;
    this.markerLabel.textContent = label;
    this.markerLabel.style.color = css;
  }

  // --------------------------------------------------------------- ciclo/vista

  applyMeasure(text: string): boolean {
    const applied = this.current.value(text);
    if (applied) this.requestRender();
    return applied;
  }

  zoomExtents(): void {
    const b = model.bounds();
    const box = b
      ? new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max))
      : new THREE.Box3(new THREE.Vector3(-5, -5, 0), new THREE.Vector3(5, 5, 3));
    this.rig.frame(box, this.size.width / Math.max(1, this.size.height));
    this.requestRender();
  }

  setStandardView(view: 'iso' | 'topo' | 'frente' | 'direita' | 'esquerda' | 'tras'): void {
    this.rig.setStandardView(view);
    this.requestRender();
  }

  resize(): void {
    const { width, height } = this.size;
    if (!width || !height) return;
    // Precisa atualizar também o estilo: o construtor deixou width/height em px
    // no elemento, e esse inline vence o CSS — sem isto o canvas não acompanha
    // o painel da direita recolhendo.
    this.renderer.setSize(width, height);
    this.rig.setAspect(width / height);
    const dpr = this.renderer.getPixelRatio();
    this.modelView.setResolution(width * dpr, height * dpr);
    this.overlay.setResolution(width * dpr, height * dpr);
    for (const m of this.axisMaterials) m.resolution.set(width * dpr, height * dpr);
    this.requestRender();
  }

  /** Direção da câmera em coordenadas de tela, para a bússola de eixos. */
  compassAngles(): { x: [number, number]; y: [number, number]; z: [number, number] } {
    const project = (v: THREE.Vector3): [number, number] => {
      const a = v.clone().project(this.camera);
      const o = new THREE.Vector3(0, 0, 0).project(this.camera);
      const dx = a.x - o.x;
      const dy = -(a.y - o.y);
      const len = Math.hypot(dx, dy) || 1;
      return [dx / len, dy / len];
    };
    return {
      x: project(new THREE.Vector3(1, 0, 0)),
      y: project(new THREE.Vector3(0, 1, 0)),
      z: project(new THREE.Vector3(0, 0, 1)),
    };
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    if (!this.dirty) return;
    this.dirty = false;
    if (this.sun) {
      this.sun.position.set(
        this.rig.target.x + 24,
        this.rig.target.y - 38,
        this.rig.target.z + 46,
      );
      this.sun.target.position.copy(this.rig.target);
      this.sun.target.updateMatrixWorld();
    }
    this.positionLabels();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown);
    this.modelView.dispose();
    this.overlay.dispose();
    this.renderer.dispose();
    el.remove();
    this.hud.remove();
  }
}
