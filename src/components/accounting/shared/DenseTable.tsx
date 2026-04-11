import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import React, { useState } from "react";

type SortDirection = "asc" | "desc" | null;

export interface ColumnDef<T> {
  key: string;
  label: string;
  width?: string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  render: (row: T) => React.ReactNode;
}

export interface DenseTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  onRowClick?: (row: T) => void;
  getRowKey: (row: T) => string | number;
  emptyState?: {
    icon: React.ComponentType<{ size?: number; color?: string }>;
    title: string;
    description: string;
  };
  loading?: boolean;
}

export function DenseTable<T>({
  data,
  columns,
  onRowClick,
  getRowKey,
  emptyState,
  loading = false,
}: DenseTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [hoveredRow, setHoveredRow] = useState<string | number | null>(null);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "4px solid #E8F5F3",
            borderTop: "4px solid #0F766E",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 16px",
          }}
        />
        <p style={{ fontSize: "16px", color: "var(--theme-text-muted)" }}>Loading...</p>
      </div>
    );
  }

  // Render empty state
  if (data.length === 0 && emptyState) {
    const IconComponent = emptyState.icon;
    return (
      <div
        style={{
          borderRadius: "10px",
          overflow: "hidden",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--neuron-ui-border)",
        }}
      >
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <IconComponent
            size={48}
            {...{ style: { color: "var(--neuron-ink-muted)", margin: "0 auto 12px", display: "block" } } as any}
          />
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 500,
              color: "var(--neuron-ink-primary)",
              marginBottom: "4px",
            }}
          >
            {emptyState.title}
          </h3>
          <p
            style={{
              fontSize: "14px",
              color: "var(--neuron-ink-muted)",
            }}
          >
            {emptyState.description}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      border: "1px solid var(--neuron-ui-border)", 
      borderRadius: "8px",
      overflow: "hidden",
      backgroundColor: "var(--theme-bg-surface)"
    }}>
      {/* Table Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: columns.map(col => col.width || "1fr").join(" "),
          backgroundColor: "transparent",
          borderBottom: "1px solid var(--neuron-ui-border)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            onClick={() => column.sortable && handleSort(column.key)}
            style={{
              padding: "12px 16px",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--theme-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              textAlign: column.align || "left",
              cursor: column.sortable ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              justifyContent: column.align === "right" ? "flex-end" : column.align === "center" ? "center" : "flex-start",
            }}
          >
            <span>{column.label}</span>
            {column.sortable && (
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                {sortColumn === column.key ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={14} />
                  ) : (
                    <ArrowDown size={14} />
                  )
                ) : (
                  <ChevronsUpDown size={14} style={{ opacity: 0.3 }} />
                )}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Table Body */}
      <div>
        {data.map((row, index) => {
          const rowKey = getRowKey(row);
          const isHovered = hoveredRow === rowKey;
          const isEven = index % 2 === 0;

          return (
            <div
              key={rowKey}
              onClick={() => onRowClick?.(row)}
              onMouseEnter={() => setHoveredRow(rowKey)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{
                display: "grid",
                gridTemplateColumns: columns.map(col => col.width || "1fr").join(" "),
                minHeight: "44px",
                backgroundColor: isHovered
                  ? "#F0FDF4"
                  : isEven
                  ? "#FFFFFF"
                  : "#FAFAFA",
                borderBottom: index === data.length - 1 ? "none" : "1px solid var(--neuron-ui-border)",
                cursor: onRowClick ? "pointer" : "default",
                transition: "background-color 0.15s ease",
              }}
            >
              {columns.map((column) => (
                <div
                  key={column.key}
                  style={{
                    padding: "12px 16px",
                    fontSize: "14px",
                    color: "var(--theme-text-primary)",
                    textAlign: column.align || "left",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: column.align === "right" ? "flex-end" : column.align === "center" ? "center" : "flex-start",
                    overflow: "hidden",
                  }}
                >
                  {column.render(row)}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}