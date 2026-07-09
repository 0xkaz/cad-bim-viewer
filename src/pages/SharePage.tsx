import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import DxfViewer from "../components/DxfViewer";
import IfcViewer from "../components/IfcViewer";
import {
  downloadSharedFile,
  downloadSharedFragments,
  getShare,
  getSharedFragmentsStatus,
} from "../lib/api";
import { formatDate, formatSize } from "../lib/format";
import type { FileRecord, ShareToken } from "../lib/schema";

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [share, setShare] = useState<ShareToken | null>(null);
  const [file, setFile] = useState<FileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getShare(token)
      .then(({ share: s, file: f }) => {
        setShare(s);
        setFile(f);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load share"))
      .finally(() => setLoading(false));
  }, [token]);

  const adapters = useMemo(() => {
    if (!token) return null;
    return {
      downloadFile: (_fileId: string) => downloadSharedFile(token),
      getFragmentsStatus: (_fileId: string) => getSharedFragmentsStatus(token),
      downloadFragments: (_fileId: string) => downloadSharedFragments(token),
    };
  }, [token]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-500">Loading...</div>
    );
  }

  if (error || !file || !token || !adapters) {
    return (
      <div className="h-screen flex items-center justify-center text-red-600 px-4 text-center">
        {error ?? "Share not found"}
      </div>
    );
  }

  const renderViewer = () => {
    if (file.format === "ifc") {
      return (
        <IfcViewer
          fileId={file.id}
          fileName={file.original_name}
          downloadFile={adapters.downloadFile}
          getFragmentsStatus={adapters.getFragmentsStatus}
          downloadFragments={adapters.downloadFragments}
          cacheFragments={false}
        />
      );
    }

    if (file.format === "dxf") {
      return (
        <DxfViewer
          fileId={file.id}
          fileName={file.original_name}
          downloadFile={adapters.downloadFile}
        />
      );
    }

    return (
      <div className="h-full flex items-center justify-center text-gray-600 px-4 text-center">
        <p>
          Shared preview is not available for <strong>{file.format.toUpperCase()}</strong> files.
          <br />
          Please ask the owner to view or convert this file.
        </p>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950">
      <header className="flex items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 px-4 py-3 bg-white dark:bg-gray-900">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">
            {file.original_name}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {file.format.toUpperCase()} · {formatSize(file.size_bytes)} · uploaded{" "}
            {formatDate(file.created_at)}
            {share?.expires_at && <> · expires {formatDate(share.expires_at)}</>}
          </p>
        </div>
      </header>
      <main className="flex-1 min-h-0">{renderViewer()}</main>
    </div>
  );
}
