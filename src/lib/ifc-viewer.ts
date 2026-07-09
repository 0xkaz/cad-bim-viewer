import {
  Components,
  IfcLoader,
  SimpleCamera,
  SimpleRenderer,
  SimpleScene,
  type SimpleWorld,
  Worlds,
} from "@thatopen/components";
import { type FragmentsGroup, Serializer } from "@thatopen/fragments";
import * as THREE from "three";
import * as WEBIFC from "web-ifc";

export type ViewerWorld = SimpleWorld<SimpleScene, SimpleCamera, SimpleRenderer>;

export interface IfcViewerInstance {
  components: Components;
  world: ViewerWorld;
  ifcLoader: IfcLoader;
  serializer: Serializer;
  dispose: () => void;
}

export async function createIfcViewer(container: HTMLElement): Promise<IfcViewerInstance> {
  const components = new Components();
  const worlds = components.get(Worlds);
  const world = worlds.create<SimpleScene, SimpleCamera, SimpleRenderer>() as ViewerWorld;

  const scene = new SimpleScene(components);
  world.scene = scene;
  world.renderer = new SimpleRenderer(components, container);
  world.camera = new SimpleCamera(components);

  await components.init();
  scene.setup();

  // Clear, neutral background that contrasts with common white/light IFC elements
  const isDark = document.documentElement.classList.contains("dark");
  scene.three.background = new THREE.Color(isDark ? 0x1f2937 : 0xdbe4ed);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  const fill = new THREE.DirectionalLight(0xe0ecff, 0.8);
  key.position.set(8, -10, 12);
  fill.position.set(-8, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.width = 1024;
  key.shadow.mapSize.height = 1024;
  scene.three.add(ambient, key, fill);

  const renderer = world.renderer.three;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const grid = new THREE.GridHelper(100, 100, 0x5a6a7a, 0x9aaaba);
  grid.name = "viewer-grid";
  scene.three.add(grid);

  // Subtle ground plane for shadows / spatial orientation
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.ShadowMaterial({ opacity: 0.12 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  ground.name = "viewer-ground";
  scene.three.add(ground);

  const ifcLoader = components.get(IfcLoader);
  await ifcLoader.setup({
    autoSetWasm: false,
    optionalCategories: [WEBIFC.IFCSPACE],
    wasm: {
      path: "/wasm/",
      absolute: true,
    },
  });

  const serializer = new Serializer();

  const dispose = () => {
    components.dispose();
  };

  return { components, world, ifcLoader, serializer, dispose };
}

function alignReferencePlaneToObject(world: ViewerWorld, object: THREE.Object3D): void {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const floorY = box.min.y;
  const grid = world.scene.three.getObjectByName("viewer-grid");
  if (grid) grid.position.y = floorY;

  const ground = world.scene.three.getObjectByName("viewer-ground");
  if (ground) ground.position.y = floorY - 0.01;
}

export function fitCameraToObject(
  world: ViewerWorld,
  object: THREE.Object3D,
  transition = true
): void {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : maxSize;
  const center = sphere.center;
  const distance = Math.max(radius * 2.4, maxSize * 1.5);
  // Natural isometric view: front-right-above the model
  const direction = new THREE.Vector3(1, 1, 1).normalize();
  const position = center.clone().addScaledVector(direction, distance);
  // Make sure the camera is above the model even for very flat geometries
  position.z = Math.max(position.z, box.max.z + Math.max(size.z * 0.25, radius * 0.25, 1));

  const camera = world.camera.three;
  camera.near = Math.max(radius / 1000, 0.01);
  camera.far = Math.max(distance + radius * 4, 1000);
  camera.updateProjectionMatrix();

  if (world.camera.controls?.setLookAt) {
    world.camera.controls.setLookAt(
      position.x,
      position.y,
      position.z,
      center.x,
      center.y,
      center.z,
      transition
    );
    return;
  }

  camera.position.copy(position);
  camera.lookAt(center);
}

export async function loadIfcBuffer(
  viewer: IfcViewerInstance,
  buffer: ArrayBuffer,
  name: string
): Promise<FragmentsGroup> {
  const model = await viewer.ifcLoader.load(new Uint8Array(buffer.slice(0)));
  model.name = name;
  viewer.world.scene.three.add(model);
  alignReferencePlaneToObject(viewer.world, model);
  fitCameraToObject(viewer.world, model, false);
  return model;
}

export async function loadFragmentsBuffer(
  viewer: IfcViewerInstance,
  buffer: ArrayBuffer,
  name: string
): Promise<FragmentsGroup> {
  const model = viewer.serializer.import(new Uint8Array(buffer.slice(0)));
  model.name = name;
  if (!model.children || model.children.length === 0) {
    throw new Error("Loaded fragments are empty");
  }
  viewer.world.scene.three.add(model);
  alignReferencePlaneToObject(viewer.world, model);
  fitCameraToObject(viewer.world, model, false);
  return model;
}

export function exportFragments(viewer: IfcViewerInstance, model: FragmentsGroup): Uint8Array {
  return viewer.serializer.export(model);
}
