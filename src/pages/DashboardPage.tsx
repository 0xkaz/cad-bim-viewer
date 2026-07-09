import { useCallback, useEffect, useState } from "react";
import FileList from "../components/FileList";
import FileUpload from "../components/FileUpload";
import ShareDialog from "../components/ShareDialog";
import { deleteFile, listFiles } from "../lib/api";
import type { FileRecord } from "../lib/schema";

export default function DashboardPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareFile, setShareFile] = useState<FileRecord | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { files: data } = await listFiles();
      setFiles(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUploaded = (file: FileRecord) => {
    setFiles((prev) => [file, ...prev]);
  };

  const handleFileUpdated = (file: FileRecord) => {
    setFiles((prev) => prev.map((current) => (current.id === file.id ? file : current)));
    setShareFile((current) => (current?.id === file.id ? file : current));
  };

  const handleDelete = async (file: FileRecord) => {
    try {
      await deleteFile(file.id, "Deleted by user");
      await loadFiles();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Dashboard</h1>
      <div className="mt-6">
        <FileUpload onUploaded={handleUploaded} />
      </div>
      <div className="mt-8">
        {loading ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-12">Loading...</p>
        ) : (
          <FileList files={files} onShare={setShareFile} onDelete={handleDelete} />
        )}
      </div>
      {shareFile && (
        <ShareDialog
          file={shareFile}
          onClose={() => setShareFile(null)}
          onFileUpdated={handleFileUpdated}
        />
      )}
    </div>
  );
}
