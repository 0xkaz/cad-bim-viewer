import { DxfViewer as DxfViewerEngine } from "dxf-viewer";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { downloadFile as defaultDownloadFile } from "../lib/api";

interface DxfViewerProps {
  fileId: string;
  fileName: string;
  downloadFile?: (fileId: string) => Promise<ArrayBuffer>;
}

/** Fonts tried in order. Roboto covers Latin; Noto Sans JP is fetched lazily only when a glyph
 *  (e.g. Japanese room labels) is missing from Roboto, so Latin-only drawings never pay for it. */
const FONT_URLS = ["/assets/fonts/Roboto-Regular.ttf?v=1", "/assets/fonts/NotoSansJP-Regular.ttf"];

/** $DWGCODEPAGE value (legacy DXF) → TextDecoder label. */
const CODEPAGE_TO_ENCODING: Record<string, string> = {
  ANSI_932: "shift_jis", // Japanese
  ANSI_936: "gbk", // Simplified Chinese
  ANSI_949: "euc-kr", // Korean
  ANSI_950: "big5", // Traditional Chinese
  ANSI_1250: "windows-1250",
  ANSI_1251: "windows-1251",
  ANSI_1252: "windows-1252",
  ANSI_1253: "windows-1253",
  ANSI_1254: "windows-1254",
  ANSI_1255: "windows-1255",
  ANSI_1256: "windows-1256",
  ANSI_1257: "windows-1257",
  ANSI_1258: "windows-1258",
};

/**
 * Determine the text encoding of a DXF file. Modern DXF (R2007+) is UTF-8; older files use a
 * Windows code page declared in the `$DWGCODEPAGE` header (Japanese CAD files are typically
 * Shift-JIS). dxf-viewer must be told the encoding before parsing, so we sniff it here: if the
 * bytes are valid UTF-8 we use UTF-8, otherwise we fall back to the declared code page. Getting
 * this wrong is what turns Japanese labels into "����".
 */
function detectDxfEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    const header = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
    const match = header.match(/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*([A-Za-z0-9_]+)/);
    const codepage = match?.[1]?.toUpperCase();
    return (codepage && CODEPAGE_TO_ENCODING[codepage]) || "windows-1252";
  }
}

export default function DxfViewer({
  fileId,
  fileName,
  downloadFile = defaultDownloadFile,
}: DxfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<InstanceType<typeof DxfViewerEngine> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<string>(`Loading ${fileName}...`);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<
    { name: string; displayName: string; color: number; visible: boolean }[]
  >([]);
  const [showLayers, setShowLayers] = useState(false);
  const [viewerMessage, setViewerMessage] = useState<string | null>(null);

  const fitView = useCallback(() => {
    const viewer = viewerRef.current;
    const bounds = viewer?.GetBounds();
    if (!viewer || !bounds) return;

    const origin = viewer.GetOrigin();
    viewer.FitView(
      bounds.minX - origin.x,
      bounds.maxX - origin.x,
      bounds.minY - origin.y,
      bounds.maxY - origin.y,
      0.12
    );
    viewer.Render();
  }, []);

  const toggleLayer = useCallback((name: string, visible: boolean) => {
    viewerRef.current?.ShowLayer(name, visible);
    setLayers((prev) => prev.map((l) => (l.name === name ? { ...l, visible } : l)));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let viewer: InstanceType<typeof DxfViewerEngine> | null = null;
    let objectUrl: string | null = null;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setProgress("Downloading DXF...");

        const buffer = await downloadFile(fileId);
        const fileEncoding = detectDxfEncoding(buffer);
        const blob = new Blob([buffer], { type: "application/dxf" });
        objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;

        setProgress("Initializing 2D viewer...");
        viewer = new DxfViewerEngine(container, {
          autoResize: true,
          colorCorrection: true,
          blackWhiteInversion: true,
          clearColor: new THREE.Color("#e8eef5"),
          clearAlpha: 1,
          sceneOptions: { wireframeMesh: false },
          fileEncoding,
        });
        if (!viewer.HasRenderer()) {
          throw new Error("WebGL renderer is not available. Try refreshing the page.");
        }
        viewer.SetSize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1));
        viewerRef.current = viewer;
        viewer.Subscribe("message", (event: Event) => {
          const detail = (event as CustomEvent).detail as { message: string; level: string };
          if (detail.level === "warn" || detail.level === "error") {
            setViewerMessage(detail.message);
          }
        });

        setProgress("Parsing DXF...");
        const loadOptions = {
          url: objectUrl,
          fonts: FONT_URLS as string[] | null,
          progressCbk: (
            phase: "font" | "fetch" | "parse" | "prepare",
            processed: number,
            total: number
          ) => {
            const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
            setProgress(`${phase}... ${percent}%`);
          },
        };
        try {
          await viewer.Load(loadOptions);
        } catch (loadErr) {
          const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
          if (loadOptions.fonts && /font|opentype|signature|woff|ttf/i.test(msg)) {
            console.warn("Font load failed, retrying without fonts:", msg);
            setViewerMessage("Font load failed; rendering without text entities.");
            await viewer.Load({ ...loadOptions, fonts: null });
          } else {
            throw loadErr;
          }
        }

        const layerList: { name: string; displayName: string; color: number; visible: boolean }[] =
          [];
        for (const layer of viewer?.GetLayers() ?? []) {
          layerList.push({ ...layer, visible: true });
        }
        setLayers(layerList);

        const bounds = viewer.GetBounds();
        if (!bounds || bounds.maxX - bounds.minX < Number.MIN_VALUE * 2) {
          setViewerMessage("No renderable entities found in this DXF.");
        }

        requestAnimationFrame(fitView);
        setProgress("Ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load DXF");
      } finally {
        setLoading(false);
      }
    };

    void load();

    return () => {
      viewer?.Destroy();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      } else if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      viewerRef.current = null;
      objectUrlRef.current = null;
    };
  }, [fileId, downloadFile, fitView]);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
          <button
            type="button"
            onClick={fitView}
            className="rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Fit View
          </button>
          <button
            type="button"
            onClick={() => containerRef.current?.requestFullscreen()}
            className="rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Fullscreen
          </button>
          <button
            type="button"
            onClick={() => setShowLayers((v) => !v)}
            className="rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {showLayers ? "Hide Layers" : "Layers"}
          </button>
        </div>
        <div className="relative flex-1 overflow-hidden">
          {/* dxf-viewer forces this element's `position: relative` (autoResize), so it must
              carry its own height. `absolute inset-0` would collapse to 0px and hide the canvas. */}
          <div ref={containerRef} className="h-full w-full" />
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
          {!loading && viewerMessage && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-yellow-50 dark:bg-yellow-950 px-4 py-2 shadow-lg max-w-md">
              <p className="text-xs text-yellow-700 dark:text-yellow-300">{viewerMessage}</p>
            </div>
          )}
        </div>
      </div>
      {showLayers && (
        <div className="w-64 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 overflow-auto">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Layers</h3>
          {layers.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">No layers found.</p>
          ) : (
            <ul className="space-y-1">
              {layers.map((layer) => (
                <li key={layer.name} className="flex items-center gap-2">
                  <input
                    id={`layer-${layer.name}`}
                    type="checkbox"
                    checked={layer.visible}
                    onChange={(e) => toggleLayer(layer.name, e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <label
                    htmlFor={`layer-${layer.name}`}
                    className="text-sm text-gray-700 dark:text-gray-300 truncate"
                    title={layer.displayName}
                  >
                    {layer.displayName}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
