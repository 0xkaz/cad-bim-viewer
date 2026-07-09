import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import DataTable from "../components/DataTable";
import {
  adminListAudit,
  adminListConversionQuotas,
  adminListConversions,
  adminListFiles,
  adminListUsers,
} from "../lib/api";
import { formatDate, formatSize } from "../lib/format";
import type { AuditLog, Conversion, ConversionQuota, FileRecord, User } from "../lib/schema";

type Tab = "files" | "users" | "audit" | "conversions";

const fileColumnHelper = createColumnHelper<FileRecord>();
const userColumnHelper = createColumnHelper<User>();
const auditColumnHelper = createColumnHelper<AuditLog>();
const conversionColumnHelper = createColumnHelper<Conversion>();
const quotaColumnHelper = createColumnHelper<ConversionQuota>();

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("files");
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [quotas, setQuotas] = useState<ConversionQuota[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminListFiles(),
      adminListUsers(),
      adminListAudit(),
      adminListConversions(),
      adminListConversionQuotas(),
    ])
      .then(([f, u, a, c, q]) => {
        setFiles(f.files);
        setUsers(u.users);
        setLogs(a.logs);
        setConversions(c.conversions);
        setQuotas(q.quotas);
      })
      .catch((err) => alert(err instanceof Error ? err.message : "Failed to load admin data"))
      .finally(() => setLoading(false));
  }, []);

  const fileColumns = useMemo(
    () => [
      fileColumnHelper.accessor("original_name", { header: "Name" }),
      fileColumnHelper.accessor("format", {
        header: "Format",
        cell: (info) => info.getValue().toUpperCase(),
      }),
      fileColumnHelper.accessor("size_bytes", {
        header: "Size",
        cell: (info) => formatSize(info.getValue()),
      }),
      fileColumnHelper.accessor("owner_id", { header: "Owner" }),
      fileColumnHelper.accessor("is_public", {
        header: "Public",
        cell: (info) => (info.getValue() === 1 ? "Yes" : "No"),
      }),
      fileColumnHelper.accessor("is_deleted", {
        header: "Deleted",
        cell: (info) => (info.getValue() === 1 ? "Yes" : "No"),
      }),
      fileColumnHelper.accessor("created_at", {
        header: "Created",
        cell: (info) => formatDate(info.getValue()),
      }),
    ],
    []
  ) as ColumnDef<FileRecord, unknown>[];

  const userColumns = useMemo(
    () => [
      userColumnHelper.accessor("email", { header: "Email" }),
      userColumnHelper.accessor("name", { header: "Name" }),
      userColumnHelper.accessor("is_admin", {
        header: "Admin",
        cell: (info) => (info.getValue() ? "Yes" : "No"),
      }),
      userColumnHelper.accessor("created_at", {
        header: "Created",
        cell: (info) => formatDate(info.getValue()),
      }),
    ],
    []
  ) as ColumnDef<User, unknown>[];

  const auditColumns = useMemo(
    () => [
      auditColumnHelper.accessor("created_at", {
        header: "Time",
        cell: (info) => formatDate(info.getValue()),
      }),
      auditColumnHelper.accessor("actor_email", { header: "Actor" }),
      auditColumnHelper.accessor("action", { header: "Action" }),
      auditColumnHelper.accessor("target_type", { header: "Target" }),
      auditColumnHelper.accessor("target_id", { header: "Target ID" }),
    ],
    []
  ) as ColumnDef<AuditLog, unknown>[];

  const conversionColumns = useMemo(
    () => [
      conversionColumnHelper.accessor("created_at", {
        header: "Created",
        cell: (info) => formatDate(info.getValue()),
      }),
      conversionColumnHelper.accessor("owner_id", { header: "Owner" }),
      conversionColumnHelper.accessor("source_format", {
        header: "From",
        cell: (info) => info.getValue().toUpperCase(),
      }),
      conversionColumnHelper.accessor("target_format", {
        header: "To",
        cell: (info) => info.getValue().toUpperCase(),
      }),
      conversionColumnHelper.accessor("status", {
        header: "Status",
        cell: (info) => info.getValue().toUpperCase(),
      }),
    ],
    []
  ) as ColumnDef<Conversion, unknown>[];

  const quotaColumns = useMemo(
    () => [
      quotaColumnHelper.accessor("user_id", { header: "User" }),
      quotaColumnHelper.accessor("period", { header: "Period" }),
      quotaColumnHelper.accessor("used_count", { header: "Used" }),
      quotaColumnHelper.accessor("updated_at", {
        header: "Updated",
        cell: (info) => formatDate(info.getValue()),
      }),
    ],
    []
  ) as ColumnDef<ConversionQuota, unknown>[];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Console</h1>
      <div className="mt-6 border-b border-gray-200 dark:border-gray-800">
        <nav className="flex gap-6">
          {(["files", "users", "audit", "conversions"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "pb-2 text-sm font-medium capitalize",
                tab === t
                  ? "border-b-2 border-brand-600 text-brand-600"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-6">
        {loading ? (
          <p className="text-center text-gray-500 py-12">Loading...</p>
        ) : tab === "files" ? (
          <DataTable data={files} columns={fileColumns} />
        ) : tab === "users" ? (
          <DataTable data={users} columns={userColumns} />
        ) : tab === "audit" ? (
          <DataTable data={logs} columns={auditColumns} />
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Conversions
            </h2>
            <DataTable data={conversions} columns={conversionColumns} />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mt-8 mb-4">
              Quotas
            </h2>
            <DataTable data={quotas} columns={quotaColumns} />
          </>
        )}
      </div>
    </div>
  );
}
