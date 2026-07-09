import type { FragmentsGroup } from "@thatopen/fragments";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  downloadFile as defaultDownloadFile,
  downloadFragments as defaultDownloadFragments,
  getFragmentsStatus as defaultGetFragmentsStatus,
  uploadFragments as defaultUploadFragments,
} from "../lib/api";
import {
  type IfcViewerInstance,
  createIfcViewer,
  exportFragments,
  fitCameraToObject,
  loadFragmentsBuffer,
  loadIfcBuffer,
} from "../lib/ifc-viewer";
import type { FileRecord } from "../lib/schema";
import PropertyPanel from "./PropertyPanel";
import ViewerToolbar from "./ViewerToolbar";

interface IfcViewerProps {
  fileId: string;
  fileName: string;
  downloadFile?: (fileId: string) => Promise<ArrayBuffer>;
  getFragmentsStatus?: (fileId: string) => Promise<{
    has_fragments: boolean;
    fragments_r2_key: string | null;
    fragments_size_bytes: number | null;
    fragments_created_at: string | null;
  }>;
  downloadFragments?: (fileId: string) => Promise<ArrayBuffer>;
  uploadFragments?: (fileId: string, blob: Blob) => Promise<Pick<FileRecord, never>>;
  cacheFragments?: boolean;
}

export default function IfcViewer({
  fileId,
  fileName,
  downloadFile = defaultDownloadFile,
  getFragmentsStatus = defaultGetFragmentsStatus,
  downloadFragments = defaultDownloadFragments,
  uploadFragments = defaultUploadFragments,
  cacheFragments = true,
}: IfcViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<IfcViewerInstance | null>(null);
  const modelRef = useRef<FragmentsGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("Initializing viewer...");
  const [selectedProperties, setSelectedProperties] = useState<Record<string, unknown> | null>(
    null
  );
  const [showGrid, setShowGrid] = useState(true);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const highlightRef = useRef<THREE.Box3Helper | null>(null);
  const fragmentsFailedRef = useRef(false);

  const loadModel = useCallback(async () => {
    if (!viewerRef.current) return;
    setLoading(true);
    setError(null);

    try {
      setProgress("Checking fragments cache...");
      const status = await getFragmentsStatus(fileId);

      let model: FragmentsGroup;
      if (status.has_fragments && !fragmentsFailedRef.current) {
        setProgress("Loading cached fragments...");
        try {
          const buffer = await downloadFragments(fileId);
          model = await loadFragmentsBuffer(viewerRef.current, buffer, fileName);
        } catch (fragErr) {
          console.warn("Fragments load failed, falling back to IFC source:", fragErr);
          fragmentsFailedRef.current = true;
          setProgress("Downloading IFC file...");
          const buffer = await downloadFile(fileId);
          setProgress("Converting IFC to 3D model...");
          model = await loadIfcBuffer(viewerRef.current, buffer, fileName);
        }
      } else {
        setProgress("Downloading IFC file...");
        const buffer = await downloadFile(fileId);

        setProgress("Converting IFC to 3D model...");
        model = await loadIfcBuffer(viewerRef.current, buffer, fileName);

        // Export fragments and upload in the background
        if (cacheFragments) {
          setProgress("Caching fragments for faster reload...");
          try {
            const fragmentsBytes = exportFragments(viewerRef.current, model);
            await uploadFragments(
              fileId,
              new Blob([fragmentsBytes.buffer as ArrayBuffer], { type: "application/octet-stream" })
            );
          } catch (cacheErr) {
            // Non-fatal: caching failure shouldn't break viewing
            console.warn("Failed to cache fragments:", cacheErr);
          }
        }
      }

      modelRef.current = model;
      setProgress("Ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load model");
    } finally {
      setLoading(false);
    }
  }, [
    fileId,
    fileName,
    downloadFile,
    getFragmentsStatus,
    downloadFragments,
    uploadFragments,
    cacheFragments,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;

    let instance: IfcViewerInstance | null = null;
    createIfcViewer(containerRef.current)
      .then((v) => {
        instance = v;
        viewerRef.current = v;
        void loadModel();
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));

    return () => {
      viewerRef.current = null;
      instance?.dispose();
    };
  }, [loadModel]);

  // Toggle grid
  useEffect(() => {
    if (!viewerRef.current) return;
    const grid = viewerRef.current.world.scene.three.getObjectByName("viewer-grid");
    if (grid) grid.visible = showGrid;
    const ground = viewerRef.current.world.scene.three.getObjectByName("viewer-ground");
    if (ground) ground.visible = showGrid;
  }, [showGrid]);

  const handleFitView = useCallback(() => {
    const viewer = viewerRef.current;
    const model = modelRef.current;
    if (viewer && model) {
      fitCameraToObject(viewer.world, model);
    }
  }, []);

  const handleFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen();
  }, []);

  const handleClick = useCallback(async (event: React.MouseEvent) => {
    if (!viewerRef.current || !modelRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, viewerRef.current.world.camera.three);
    const intersects = raycasterRef.current.intersectObjects(modelRef.current.children, true);
    if (intersects.length === 0) {
      setSelectedProperties(null);
      return;
    }

    const firstHit = intersects[0];
    const fragment = firstHit.object;
    if (!fragment.userData || typeof fragment.userData.expressID !== "number") {
      setSelectedProperties(null);
      return;
    }

    // Highlight selected element
    if (highlightRef.current) {
      viewerRef.current.world.scene.three.remove(highlightRef.current);
      highlightRef.current.dispose();
      highlightRef.current = null;
    }
    const box = new THREE.Box3().setFromObject(fragment);
    const helper = new THREE.Box3Helper(box, 0xf97316);
    helper.name = "selection-highlight";
    viewerRef.current.world.scene.three.add(helper);
    highlightRef.current = helper;

    const expressID = fragment.userData.expressID as number;
    const properties = await modelRef.current.getProperties(expressID);
    setSelectedProperties(properties ?? { expressID, info: "No properties found" });
  }, []);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <ViewerToolbar
          onFitView={handleFitView}
          onToggleGrid={() => setShowGrid((v) => !v)}
          showGrid={showGrid}
          onFullscreen={handleFullscreen}
        />
        <div className="relative flex-1 overflow-hidden">
          <div
            ref={containerRef}
            tabIndex={0}
            role="button"
            aria-label="3D model viewport"
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                // Cannot synthesize mouse position for keyboard; just trigger fit view
                handleFitView();
              }
            }}
            className="absolute inset-0"
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 dark:bg-black/50">
              <div className="rounded-lg bg-white dark:bg-gray-900 px-4 py-3 shadow-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{progress}</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 dark:bg-black/50">
              <div className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-3 shadow-lg max-w-md">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <PropertyPanel properties={selectedProperties} />
    </div>
  );
}
