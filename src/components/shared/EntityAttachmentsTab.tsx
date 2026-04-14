/**
 * EntityAttachmentsTab
 *
 * Shared file attachments component parameterized by entity type.
 * Used by both Projects and Contracts — same drag-and-drop UI,
 * same upload/download/delete flow, different API path and KV prefix.
 *
 * @see /docs/blueprints/CONTRACT_PARITY_BLUEPRINT.md - Phase 4 (DRY extraction)
 */

import { useState } from "react";
import { Upload, File, Download, Trash2, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase/client";
import { queryKeys } from "../../lib/queryKeys";
import { toast } from "../ui/toast-utils";

interface EntityAttachmentsTabProps {
  entityId: string;
  /** API path segment: "projects" or "contracts" */
  entityType: "projects" | "contracts";
  currentUser?: {
    id?: string;
    name: string;
    email: string;
    department: string;
  } | null;
}

interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  file_url: string;
  uploaded_by_name: string;
  created_at: string;
  isUploading?: boolean;
}

// Map entityType to the actual DB table name and FK column
const TABLE_MAP: Record<string, { table: string; fkColumn: string }> = {
  projects: { table: "project_attachments", fkColumn: "project_id" },
  contracts: { table: "contract_attachments", fkColumn: "contract_id" },
};

export function EntityAttachmentsTab({ entityId, entityType, currentUser }: EntityAttachmentsTabProps) {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const { table, fkColumn } = TABLE_MAP[entityType] ?? { table: "project_attachments", fkColumn: "project_id" };

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: queryKeys.attachments.forEntity(entityType, entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq(fkColumn, entityId)
        .order('created_at', { ascending: false });
      if (error) {
        toast.error("Failed to load attachments");
        return [] as Attachment[];
      }
      return (data || []) as Attachment[];
    },
    staleTime: 30_000,
  });

  const refetchAttachments = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.attachments.forEntity(entityType, entityId) });
  };

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!currentUser) {
      toast.error("You must be logged in to upload files");
      return;
    }

    setIsUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
          const filePath = `${entityType}/${entityId}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(filePath, file);

          if (uploadError) throw new Error(`Failed to upload ${file.name}`);

          const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);

          // Save attachment record
          await supabase.from(table).insert({
            id: crypto.randomUUID(),
            [fkColumn]: entityId,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            file_url: urlData.publicUrl,
            uploaded_by_name: currentUser.name,
          });
        } catch (error) {
          throw error;
        }
      }

      toast.success(`Successfully uploaded ${files.length} file(s)`);
      
      // Refresh attachments
      refetchAttachments();
    } catch (error) {
      console.error("Error uploading files:", error);
      toast.error("Failed to upload files");
    } finally {
      setIsUploading(false);
    }
  };

  // Handle file delete
  const handleDelete = async (attachmentId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;

    try {
      // Get the attachment to find storage path
      const attachment = attachments.find(a => a.id === attachmentId);
      
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq('id', attachmentId);

      if (!deleteError) {
        toast.success("File deleted successfully");
        refetchAttachments();
      } else {
        throw new Error("Failed to delete file");
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      toast.error("Failed to delete file");
    }
  };

  // Handle file download
  const handleDownload = async (attachment: Attachment) => {
    try {
      const link = document.createElement('a');
      link.href = attachment.file_url;
      link.download = attachment.file_name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error downloading file:", error);
      toast.error("Failed to download file");
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Get file icon based on type
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <ImageIcon size={20} />;
    if (fileType.includes('pdf')) return <FileText size={20} />;
    return <File size={20} />;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  return (
    <div style={{ padding: "32px 48px", height: "100%" }}>
      {/* Header with Upload Button */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "flex-start",
        marginBottom: "24px",
        paddingBottom: "16px",
        borderBottom: "1px solid var(--neuron-ui-border)"
      }}>
        <div>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "var(--neuron-brand-green)",
              marginBottom: "4px",
            }}
          >
            Attachments
          </h2>
          <p
            style={{
              fontSize: "13px",
              color: "var(--neuron-ink-muted)",
              margin: 0,
            }}
          >
            {attachments.length > 0 
              ? `${attachments.length} file${attachments.length !== 1 ? 's' : ''} uploaded`
              : "No files uploaded yet"
            }
          </p>
        </div>
        
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            backgroundColor: "var(--neuron-brand-green)",
            color: "white",
            fontSize: "13px",
            fontWeight: 600,
            borderRadius: "6px",
            cursor: isUploading ? "not-allowed" : "pointer",
            opacity: isUploading ? 0.6 : 1,
            transition: "all 0.2s ease",
            border: "none",
          }}
          onMouseEnter={(e) => {
            if (!isUploading) {
              e.currentTarget.style.backgroundColor = "#0D5B57";
            }
          }}
          onMouseLeave={(e) => {
            if (!isUploading) {
              e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
            }
          }}
        >
          <Upload size={16} />
          {isUploading ? "Uploading..." : "Upload Files"}
          <input
            type="file"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
            disabled={isUploading}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {/* Drag and Drop Zone - Only show when no files or during drag */}
      {(attachments.length === 0 || isDragging) && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            backgroundColor: isDragging ? "var(--theme-bg-surface-tint)" : "var(--neuron-pill-inactive-bg)",
            border: isDragging 
              ? "2px dashed var(--neuron-brand-green)" 
              : "2px dashed var(--theme-border-default)",
            borderRadius: "8px",
            padding: "48px 32px",
            textAlign: "center",
            marginBottom: "24px",
            transition: "all 0.2s ease",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Upload
            size={40}
            style={{
              color: isDragging ? "var(--neuron-brand-green)" : "var(--theme-text-muted)",
              marginBottom: "16px",
            }}
          />
          <p
            style={{
              fontSize: "14px",
              color: "var(--neuron-ink-primary)",
              marginBottom: "4px",
            }}
          >
            {isDragging ? "Drop files here" : "Drag and drop files here"}
          </p>
          <p
            style={{
              fontSize: "12px",
              color: "var(--neuron-ink-muted)",
              margin: 0,
            }}
          >
            or click "Upload Files" button above
          </p>
        </div>
      )}

      {/* Attachments List */}
      {isLoading ? (
        <div
          style={{
            padding: "48px",
            textAlign: "center",
            color: "var(--neuron-ink-muted)",
          }}
        >
          <Loader2 size={24} style={{ marginBottom: "16px" }} />
          Loading attachments...
        </div>
      ) : attachments.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "12px",
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              style={{
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                padding: "12px",
                transition: "all 0.2s ease",
                opacity: attachment.isUploading ? 0.6 : 1,
                pointerEvents: attachment.isUploading ? "none" : "auto",
              }}
              onMouseEnter={(e) => {
                if (!attachment.isUploading) {
                  e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
                  e.currentTarget.style.boxShadow = "0 0 0 1px rgba(15, 118, 110, 0.1)";
                }
              }}
              onMouseLeave={(e) => {
                if (!attachment.isUploading) {
                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
            >
              <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                <div
                  style={{
                    color: "var(--neuron-brand-green)",
                    flexShrink: 0,
                  }}
                >
                  {attachment.isUploading ? (
                    <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    getFileIcon(attachment.file_type)
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--neuron-ink-primary)",
                      marginBottom: "2px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={attachment.file_name}
                  >
                    {attachment.file_name}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--neuron-ink-muted)",
                    }}
                  >
                    {attachment.isUploading ? (
                      "Uploading..."
                    ) : (
                      <>{formatFileSize(attachment.file_size)} · {formatDate(attachment.created_at)}</>
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: "11px",
                  color: "var(--neuron-ink-muted)",
                  marginBottom: "10px",
                  paddingTop: "10px",
                  borderTop: "1px solid var(--theme-border-subtle)",
                }}
              >
                {attachment.uploaded_by_name}
              </div>

              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => handleDownload(attachment)}
                  disabled={attachment.isUploading}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    backgroundColor: "var(--theme-bg-surface)",
                    border: "1px solid var(--neuron-brand-green)",
                    borderRadius: "4px",
                    color: "var(--neuron-brand-green)",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: attachment.isUploading ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    opacity: attachment.isUploading ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!attachment.isUploading) {
                      e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!attachment.isUploading) {
                      e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                    }
                  }}
                >
                  <Download size={12} />
                  Download
                </button>
                <button
                  onClick={() => handleDelete(attachment.id)}
                  disabled={attachment.isUploading}
                  style={{
                    padding: "6px 10px",
                    backgroundColor: "var(--theme-bg-surface)",
                    border: "1px solid var(--theme-border-default)",
                    borderRadius: "4px",
                    color: "var(--neuron-ink-muted)",
                    fontSize: "11px",
                    cursor: attachment.isUploading ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                    opacity: attachment.isUploading ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!attachment.isUploading) {
                      e.currentTarget.style.borderColor = "var(--theme-status-danger-fg)";
                      e.currentTarget.style.color = "var(--theme-status-danger-fg)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!attachment.isUploading) {
                      e.currentTarget.style.borderColor = "var(--theme-border-default)";
                      e.currentTarget.style.color = "var(--neuron-ink-muted)";
                    }
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}