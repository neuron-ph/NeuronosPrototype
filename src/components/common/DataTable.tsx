import React from "react";
import { Loader2, LucideIcon } from "lucide-react";
import { SkeletonTable } from "../shared/NeuronSkeleton";

export interface ColumnDef<T> {
  header: string;
  accessorKey?: keyof T;
  width?: string;
  align?: "left" | "right" | "center";
  cell?: (item: T) => React.ReactNode;
  className?: string;
  /** Hide this column in mobile card view (e.g. purely decorative or redundant columns) */
  mobileHidden?: boolean;
}

export interface TableSummary {
  label: string;
  value: React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  isLoading?: boolean;
  emptyMessage?: React.ReactNode;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string;
  icon?: LucideIcon;
  footerSummary?: TableSummary[];

  // Selection Props
  enableSelection?: boolean;
  selectedIds?: (string | number)[];
  onSelectRow?: (id: string | number) => void;
  onSelectAll?: (checked: boolean) => void;

  // Render Options
  renderTableOnEmpty?: boolean;
}

export function DataTable<T extends { id?: string | number }>({
  data,
  columns,
  isLoading,
  emptyMessage = "No data found",
  onRowClick,
  rowClassName,
  icon: Icon,
  footerSummary,
  enableSelection,
  selectedIds = [],
  onSelectRow,
  onSelectAll,
  renderTableOnEmpty = false,
}: DataTableProps<T>) {
  const allSelected =
    data.length > 0 && data.every((item) => item.id && selectedIds.includes(item.id));
  const isIndeterminate =
    data.some((item) => item.id && selectedIds.includes(item.id)) && !allSelected;

  if (isLoading) {
    return <SkeletonTable rows={8} cols={columns.length} />;
  }

  if (data.length === 0 && !renderTableOnEmpty) {
    return (
      <div className="border border-[var(--theme-border-default)] rounded-[10px] overflow-hidden bg-[var(--theme-bg-surface)]">
        <div className="px-6 py-12 text-center text-[var(--theme-text-muted)] text-[13px]">
          {emptyMessage}
        </div>
      </div>
    );
  }

  const visibleColumns = columns.filter((c) => !c.mobileHidden);

  return (
    <div className="border border-[var(--theme-border-default)] rounded-[10px] overflow-hidden bg-[var(--theme-bg-surface)]">

      {/* ── Mobile card view (< md) ── */}
      <div className="md:hidden">
        {data.length === 0 && renderTableOnEmpty ? (
          <div className="px-6 py-12 text-center text-[var(--theme-text-muted)] text-[13px]">
            {emptyMessage}
          </div>
        ) : (
          <>
            {/* Select-all bar */}
            {enableSelection && data.length > 0 && (
              <div
                className="flex items-center gap-3 px-4 py-2 border-b border-[var(--theme-border-default)]"
                style={{ backgroundColor: "var(--theme-bg-surface)" }}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-[var(--theme-border-default)] text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isIndeterminate;
                  }}
                  onChange={(e) => onSelectAll?.(e.target.checked)}
                />
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  Select all
                </span>
              </div>
            )}

            <div className="divide-y divide-[var(--theme-border-default)]">
              {data.map((item, rowIdx) => {
                const isSelected = item.id ? selectedIds.includes(item.id) : false;
                const extraClass = rowClassName ? rowClassName(item) : "";
                return (
                  <div
                    key={item.id || rowIdx}
                    onClick={() => onRowClick?.(item)}
                    className={`px-4 py-3 transition-colors ${onRowClick ? "cursor-pointer active:bg-[var(--theme-state-hover)]" : ""} ${extraClass}`}
                    style={
                      isSelected
                        ? { backgroundColor: "var(--theme-state-selected, var(--theme-state-hover))" }
                        : undefined
                    }
                  >
                    {/* Card header row: icon + selection */}
                    {(enableSelection || Icon) && (
                      <div className="flex items-center gap-2 mb-2">
                        {enableSelection && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-[var(--theme-border-default)] text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]"
                              checked={isSelected}
                              onChange={() => item.id && onSelectRow?.(item.id)}
                            />
                          </div>
                        )}
                        {Icon && (
                          <Icon className="w-4 h-4 text-[var(--theme-text-muted)] flex-shrink-0" />
                        )}
                      </div>
                    )}

                    {/* Label → value pairs */}
                    <div className="space-y-1.5">
                      {visibleColumns.map((col, colIdx) => {
                        const value = col.cell
                          ? col.cell(item)
                          : /* @ts-ignore - Generic accessor handling */
                            item[col.accessorKey];

                        // Skip empty-looking cells on mobile to keep cards compact
                        if (value === null || value === undefined || value === "") return null;

                        const isFirst = colIdx === 0;
                        return (
                          <div key={colIdx} className={isFirst ? "" : "flex items-start gap-2"}>
                            {isFirst ? (
                              // First column is the card "title" — larger, no label
                              <div
                                className="text-[13px] font-semibold"
                                style={{ color: "var(--theme-text-primary)" }}
                              >
                                {value}
                              </div>
                            ) : (
                              <>
                                <span
                                  className="text-[11px] font-semibold uppercase tracking-[0.04em] mt-0.5 flex-shrink-0"
                                  style={{
                                    color: "var(--theme-text-muted)",
                                    minWidth: "80px",
                                  }}
                                >
                                  {col.header}
                                </span>
                                <span
                                  className="text-[12px]"
                                  style={{ color: "var(--theme-text-primary)" }}
                                >
                                  {value}
                                </span>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile footer summary */}
            {footerSummary && footerSummary.length > 0 && (
              <div
                className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-3 border-t border-[var(--theme-border-default)]"
                style={{ backgroundColor: "var(--theme-bg-surface)" }}
              >
                {footerSummary.map((summary, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-semibold uppercase tracking-[0.002em]"
                      style={{ color: "var(--theme-text-muted)" }}
                    >
                      {summary.label}
                    </span>
                    <span className="text-[13px] font-bold">{summary.value}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Desktop table view (≥ md) ── */}
      <table className="w-full border-collapse hidden md:table">
        <thead className="bg-[var(--theme-bg-surface)] border-b border-[var(--theme-border-default)]">
          <tr>
            {enableSelection && (
              <th className="w-10 px-4 py-3 text-center">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-[var(--theme-border-default)] text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isIndeterminate;
                  }}
                  onChange={(e) => onSelectAll?.(e.target.checked)}
                />
              </th>
            )}
            {Icon && <th className="w-10 px-4 py-3"></th>}
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={`px-4 py-3 text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.002em] ${col.className || ""}`}
                style={{ textAlign: col.align || "left", width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--theme-border-default)]">
          {data.length === 0 && renderTableOnEmpty ? (
            <tr>
              <td
                colSpan={columns.length + (enableSelection ? 1 : 0) + (Icon ? 1 : 0)}
                className="px-6 py-12 text-center text-[var(--theme-text-muted)] text-[13px]"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, rowIdx) => (
              <tr
                key={item.id || rowIdx}
                onClick={() => onRowClick?.(item)}
                className={`
                  transition-colors
                  ${onRowClick ? "cursor-pointer hover:bg-[var(--theme-state-hover)]" : ""}
                  ${rowClassName ? rowClassName(item) : ""}
                `}
              >
                {enableSelection && (
                  <td
                    className="w-10 px-4 py-3 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-[var(--theme-border-default)] text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]"
                      checked={item.id ? selectedIds.includes(item.id) : false}
                      onChange={() => item.id && onSelectRow?.(item.id)}
                    />
                  </td>
                )}
                {Icon && (
                  <td className="w-10 px-4 py-3 text-center">
                    <div className="flex items-center justify-center">
                      <Icon className="w-4 h-4 text-[var(--theme-text-muted)]" />
                    </div>
                  </td>
                )}
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-4 py-3"
                    style={{ textAlign: col.align || "left" }}
                  >
                    {col.cell ? (
                      col.cell(item)
                    ) : (
                      <span className="text-[12px] text-[var(--theme-text-primary)] font-medium">
                        {/* @ts-ignore - Generic accessor handling */}
                        {item[col.accessorKey]}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>

        {footerSummary && footerSummary.length > 0 && (
          <tfoot className="bg-[var(--theme-bg-surface)] border-t border-[var(--theme-border-default)]">
            <tr>
              <td
                colSpan={columns.length + (enableSelection ? 2 : 1)}
                className="px-4 py-3"
              >
                <div className="flex items-center justify-end gap-8">
                  {footerSummary.map((summary, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.002em]">
                        {summary.label}
                      </span>
                      <span className="text-[13px] font-bold">{summary.value}</span>
                    </div>
                  ))}
                </div>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
