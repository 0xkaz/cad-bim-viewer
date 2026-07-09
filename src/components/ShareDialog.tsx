import { useEffect, useId, useMemo, useState } from "react";
import { createShare, listShares, revokeShare, updateFileVisibility } from "../lib/api";
import { formatDate } from "../lib/format";
import type { FileRecord, ShareToken } from "../lib/schema";

interface ShareDialogProps {
  file: FileRecord;
  onClose: () => void;
  onFileUpdated: (file: FileRecord) => void;
}

type ExpiryValue = "never" | "24" | "168" | "720";

const EXPIRY_OPTIONS: { value: ExpiryValue; label: string }[] = [
  { value: "never", label: "No expiration" },
  { value: "24", label: "24 hours" },
  { value: "168", label: "7 days" },
  { value: "720", label: "30 days" },
];

function getShareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

function isExpired(token: ShareToken): boolean {
  return Boolean(token.expires_at && new Date(token.expires_at) < new Date());
}

async function writeClipboard(text: string): Promise<void> {
  if (!navigator.clipboard) return;
  await navigator.clipboard.writeText(text);
}

export default function ShareDialog({ file, onClose, onFileUpdated }: ShareDialogProps) {
  const [tokens, setTokens] = useState<ShareToken[]>([]);
  const [linkAccessEnabled, setLinkAccessEnabled] = useState(file.is_public === 1);
  const [expiry, setExpiry] = useState<ExpiryValue>("never");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingAccess, setUpdatingAccess] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expiryId = useId();

  useEffect(() => {
    let cancelled = false;

    async function loadTokens() {
      setLoading(true);
      setError(null);
      try {
        const result = await listShares(file.id);
        if (!cancelled) setTokens(result.tokens);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load share links");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTokens();
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  const activeTokens = useMemo(() => tokens.filter((token) => !isExpired(token)), [tokens]);
  const hasActiveLinks = activeTokens.length > 0;
  const statusLabel = linkAccessEnabled
    ? hasActiveLinks
      ? "Active"
      : "No active links"
    : "Paused";

  const updateLocalFile = (updatedFile: FileRecord) => {
    setLinkAccessEnabled(updatedFile.is_public === 1);
    onFileUpdated(updatedFile);
  };

  const updateLocalVisibility = (enabled: boolean) => {
    updateLocalFile({ ...file, is_public: enabled ? 1 : 0 });
  };

  const copyLink = async (token: string) => {
    try {
      await writeClipboard(getShareUrl(token));
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken(null), 1800);
    } catch {
      setError("Failed to copy link");
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const expiresInHours = expiry === "never" ? undefined : Number(expiry);
      const result = await createShare(file.id, expiresInHours);
      const refreshed = await listShares(file.id);
      setTokens(refreshed.tokens);
      updateLocalVisibility(true);
      await writeClipboard(result.share_url).catch(() => undefined);
      setCopiedToken(result.token);
      window.setTimeout(() => setCopiedToken(null), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setCreating(false);
    }
  };

  const handleSetAccess = async (enabled: boolean) => {
    if (enabled && activeTokens.length === 0) {
      await handleCreate();
      return;
    }

    setUpdatingAccess(true);
    setError(null);
    try {
      const result = await updateFileVisibility(file.id, enabled);
      updateLocalFile(result.file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update link access");
    } finally {
      setUpdatingAccess(false);
    }
  };

  const handleRevoke = async (token: string) => {
    setRevokingToken(token);
    setError(null);
    try {
      await revokeShare(file.id, token);
      const remaining = tokens.filter((item) => item.token !== token);
      setTokens(remaining);
      if (remaining.length === 0) {
        updateLocalVisibility(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke share link");
    } finally {
      setRevokingToken(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white dark:bg-gray-900 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Share "{file.original_name}"
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Link access: {statusLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Link access</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {hasActiveLinks
                  ? `${activeTokens.length} active link${activeTokens.length === 1 ? "" : "s"}`
                  : "Create a link to enable access"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSetAccess(!linkAccessEnabled)}
              disabled={updatingAccess || creating}
              className={[
                "rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50",
                linkAccessEnabled
                  ? "border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  : "bg-brand-600 text-white hover:bg-brand-700",
              ].join(" ")}
            >
              {updatingAccess || creating
                ? "Updating..."
                : linkAccessEnabled
                  ? "Disable"
                  : "Enable"}
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor={expiryId}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                New link expiration
              </label>
              <select
                id={expiryId}
                value={expiry}
                onChange={(event) => setExpiry(event.target.value as ExpiryValue)}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Link"}
            </button>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Share links</h3>
            {loading ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
            ) : tokens.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No links yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                {tokens.map((token) => {
                  const expired = isExpired(token);
                  const url = getShareUrl(token.token);
                  return (
                    <li key={token.token} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <input
                          readOnly
                          value={url}
                          className="w-full truncate rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {expired
                            ? "Expired"
                            : token.expires_at
                              ? `Expires ${formatDate(token.expires_at)}`
                              : "No expiration"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyLink(token.token)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        {copiedToken === token.token ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(token.token)}
                        disabled={revokingToken === token.token}
                        className="rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
                      >
                        {revokingToken === token.token ? "Revoking..." : "Revoke"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
