import { Link } from "react-router-dom";
import { formatDate, formatSize } from "../lib/format";
import type { FileRecord } from "../lib/schema";

interface FileListProps {
  files: FileRecord[];
  onShare: (file: FileRecord) => void;
  onDelete: (file: FileRecord) => void;
}

export default function FileList({ files, onShare, onDelete }: FileListProps) {
  if (files.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400 py-12">No files uploaded yet.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-gray-950">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
              Format
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
              Size
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
              Uploaded
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
              Link Access
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {files.map((file) => (
            <tr key={file.id} className="hover:bg-gray-50 dark:hover:bg-gray-950">
              <td className="px-4 py-3">
                <Link
                  to={`/viewer/${file.id}`}
                  className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {file.original_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 uppercase">
                {file.format}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                {formatSize(file.size_bytes)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                {formatDate(file.created_at)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={[
                    "inline-flex rounded-full px-2 py-1 text-xs font-medium",
                    file.is_public === 1
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                  ].join(" ")}
                >
                  {file.is_public === 1 ? "Active" : "Private"}
                </span>
              </td>
              <td className="px-4 py-3 text-right space-x-2">
                <Link
                  to={`/viewer/${file.id}`}
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium dark:text-gray-300 dark:hover:text-white"
                >
                  Open
                </Link>
                <button
                  type="button"
                  onClick={() => onShare(file)}
                  className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  Share
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(file)}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
