import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ConvertibleViewer from "../components/ConvertibleViewer";
import DxfViewer from "../components/DxfViewer";
import IfcViewer from "../components/IfcViewer";
import { getFile } from "../lib/api";
import { formatDate, formatSize } from "../lib/format";
import type { FileRecord } from "../lib/schema";

export default function ViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [file, setFile] = useState<FileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getFile(id)
      .then(({ file: data }) => setFile(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load file"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">Loading...</div>;
  }

  if (error || !file) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-red-600">
        {error ?? "File not found"}
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div>
          <Link to="/dashboard" className="text-sm text-brand-600 hover:underline">
            ← Back to dashboard
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
            {file.original_name}
          </h1>
        </div>
        <dl className="flex items-center gap-4 text-sm">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Format</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100 uppercase">
              {file.format}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Size</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">
              {formatSize(file.size_bytes)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Uploaded</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">
              {formatDate(file.created_at)}
            </dd>
          </div>
        </dl>
      </div>
      {file.format === "ifc" ? (
        <IfcViewer fileId={file.id} fileName={file.original_name} />
      ) : file.format === "dxf" ? (
        <DxfViewer fileId={file.id} fileName={file.original_name} />
      ) : file.format === "dwg" ? (
        <ConvertibleViewer file={file} supportedTargets={["dxf", "ifc"]} />
      ) : file.format === "jww" ? (
        <ConvertibleViewer file={file} supportedTargets={["dxf", "dwg"]} />
      ) : (
        <div className="flex-1 flex items-center justify-center p-12 border-2 border-dashed border-gray-300 dark:border-gray-700 m-4 rounded-xl">
          <p className="text-gray-500 dark:text-gray-400 text-center">
            {file.format.toUpperCase()} viewer will be available in Phase 3.
            <br />
            <span className="text-sm text-gray-400 dark:text-gray-500">
              For now, files can be downloaded from the dashboard.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
