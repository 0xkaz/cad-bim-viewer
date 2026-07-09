import { useCallback, useId, useState } from "react";
import { uploadFile } from "../lib/api";
import type { FileRecord } from "../lib/schema";

interface FileUploadProps {
  onUploaded: (file: FileRecord) => void;
}

export default function FileUpload({ onUploaded }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputId = useId();

  const handleFile = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const { file: record } = await uploadFile(file);
        onUploaded(record);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [onUploaded]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <label
      htmlFor={inputId}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={[
        "block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
        isDragging
          ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
          : "border-gray-300 dark:border-gray-700 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-900",
        isUploading && "opacity-60 cursor-not-allowed",
      ].join(" ")}
    >
      <input
        id={inputId}
        type="file"
        accept=".ifc,.dxf"
        className="hidden"
        onChange={onChange}
        disabled={isUploading}
      />
      <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
        {isUploading ? "Uploading..." : "Drop a CAD/BIM file here, or click to browse"}
      </p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Supports IFC, DXF</p>
    </label>
  );
}
