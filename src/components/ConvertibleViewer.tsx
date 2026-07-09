import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createConversion, getConfig, getConversion, listFileConversions } from "../lib/api";
import { formatDate } from "../lib/format";
import type { Conversion, ConversionFormat, FileRecord } from "../lib/schema";

interface ConvertibleViewerProps {
  file: FileRecord;
  supportedTargets: ConversionFormat[];
}

const STATUS_STYLES: Record<Conversion["status"], string> = {
  queued: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function ConvertibleViewer({ file, supportedTargets }: ConvertibleViewerProps) {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [targetFormat, setTargetFormat] = useState<ConversionFormat>(supportedTargets[0] ?? "dxf");
  const [error, setError] = useState<string | null>(null);
  const [conversionEnabled, setConversionEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    getConfig()
      .then(({ conversion_enabled }) => setConversionEnabled(conversion_enabled))
      .catch(() => setConversionEnabled(false));
  }, []);

  const loadConversions = useCallback(async () => {
    try {
      const { conversions: data } = await listFileConversions(file.id);
      setConversions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversions");
    } finally {
      setLoading(false);
    }
  }, [file.id]);

  useEffect(() => {
    void loadConversions();
  }, [loadConversions]);

  useEffect(() => {
    const pending = conversions.filter((c) => c.status === "queued" || c.status === "running");
    if (pending.length === 0) return;

    const timers: number[] = [];
    for (const conversion of pending) {
      const timer = window.setInterval(async () => {
        try {
          const { conversion: updated } = await getConversion(conversion.id);
          setConversions((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        } catch {
          // ignore polling errors
        }
      }, 2000);
      timers.push(timer);
    }

    return () => {
      for (const timer of timers) {
        window.clearInterval(timer);
      }
    };
  }, [conversions]);

  const handleRequest = async () => {
    setRequesting(true);
    setError(null);
    try {
      const { conversion } = await createConversion(file.id, targetFormat);
      setConversions((prev) => [conversion, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion request failed");
    } finally {
      setRequesting(false);
    }
  };

  const completedDxf = conversions.find(
    (c) => c.target_format === "dxf" && c.status === "completed"
  );

  if (completedDxf?.target_file_id) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Converted to DXF{" "}
            <Link
              to={`/viewer/${completedDxf.target_file_id}`}
              className="text-brand-600 hover:underline ml-1"
            >
              Open result
            </Link>
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">
          DXF preview would render here (target file: {completedDxf.target_file_id}).
        </div>
      </div>
    );
  }

  if (conversionEnabled === false) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-300 dark:border-gray-700 m-4 rounded-xl">
        <p className="text-gray-700 dark:text-gray-300 text-center font-medium">
          {file.format.toUpperCase()} conversion is disabled in this demo.
        </p>
        <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400 text-center">
          This deployment runs a Cloudflare-only stack. Viewing is available for IFC and DXF files;
          converting {file.format.toUpperCase()} requires an external converter service that is not
          enabled here. You can still download the file from the dashboard.
        </p>
        <Link to="/dashboard" className="mt-6 text-sm text-brand-600 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  if (conversionEnabled === null) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-300 dark:border-gray-700 m-4 rounded-xl">
      <p className="text-gray-500 dark:text-gray-400 text-center">
        {file.format.toUpperCase()} files are converted before viewing.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <select
          value={targetFormat}
          onChange={(e) => setTargetFormat(e.target.value as ConversionFormat)}
          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        >
          {supportedTargets.map((fmt) => (
            <option key={fmt} value={fmt}>
              {fmt.toUpperCase()}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRequest}
          disabled={requesting || supportedTargets.length === 0}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {requesting ? "Requesting..." : "Convert"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="mt-6 text-sm text-gray-400">Loading conversion history...</p>
      ) : conversions.length > 0 ? (
        <div className="mt-8 w-full max-w-2xl">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Conversions</h3>
          <ul className="divide-y divide-gray-200 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-xl">
            {conversions.map((conversion) => (
              <li key={conversion.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {conversion.source_format.toUpperCase()} →{" "}
                    {conversion.target_format.toUpperCase()}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(conversion.created_at)}
                  </p>
                  {conversion.error_message && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {conversion.error_message}
                    </p>
                  )}
                  {conversion.target_file_id && (
                    <Link
                      to={`/viewer/${conversion.target_file_id}`}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      View result
                    </Link>
                  )}
                </div>
                <span
                  className={[
                    "px-2 py-1 rounded-full text-xs font-medium uppercase",
                    STATUS_STYLES[conversion.status],
                  ].join(" ")}
                >
                  {conversion.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
