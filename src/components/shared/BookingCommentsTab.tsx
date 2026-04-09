import { useState, useEffect, useRef } from "react";
import { useFeedbackPosition } from "../../contexts/FeedbackPositionContext";
import { Send, Paperclip, X, Download, FileText } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase/client";
import { toast } from "sonner@2.0.3";

interface FileAttachment {
  file_name: string;
  file_size: number;
  file_type: string;
  file_url: string;
}

interface BookingComment {
  id: string;
  booking_id: string;
  user_id: string;
  user_name: string;
  department: string;
  message: string;
  attachments?: FileAttachment[];
  created_at: string;
}

interface BookingCommentsTabProps {
  bookingId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserDepartment: string;
}

export function BookingCommentsTab({
  bookingId,
  currentUserId,
  currentUserName,
  currentUserDepartment,
}: BookingCommentsTabProps) {
  const { setHasCommentBar } = useFeedbackPosition();
  useEffect(() => {
    setHasCommentBar(true);
    return () => setHasCommentBar(false);
  }, [setHasCommentBar]);

  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["booking_comments", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_comments')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });
      if (error) return [] as BookingComment[];
      return (data || []) as BookingComment[];
    },
    staleTime: 30_000,
  });

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [newComment]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim() && attachedFiles.length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      let uploadedAttachments: FileAttachment[] = [];

      // Upload files if any
      if (attachedFiles.length > 0) {
        setIsUploadingFiles(true);
        
        for (const file of attachedFiles) {
          const filePath = `booking-comments/${bookingId}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(filePath, file);

          if (uploadError) {
            throw new Error(`Failed to upload ${file.name}`);
          }

          const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
          uploadedAttachments.push({
            file_name: file.name,
            file_url: urlData.publicUrl,
            file_type: file.type,
            file_size: file.size,
          });
        }
        
        setIsUploadingFiles(false);
      }

      // Create comment with attachments
      const { error: insertError } = await supabase.from('booking_comments').insert({
        booking_id: bookingId,
        user_id: currentUserId,
        user_name: currentUserName,
        department: currentUserDepartment,
        message: newComment.trim() || "",
        attachments: uploadedAttachments,
        created_at: new Date().toISOString(),
      });

      if (!insertError) {
        setNewComment("");
        setAttachedFiles([]);
        queryClient.invalidateQueries({ queryKey: ["booking_comments", bookingId] });
        toast.success("Comment added");
      } else {
        toast.error(insertError.message || "Failed to add comment");
      }
    } catch (error) {
      console.error("Error submitting booking comment:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add comment");
    } finally {
      setIsSubmitting(false);
      setIsUploadingFiles(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Check file size limit (50MB per file)
    const oversizedFiles = files.filter(f => f.size > 52428800);
    if (oversizedFiles.length > 0) {
      toast.error(`Some files exceed 50MB limit: ${oversizedFiles.map(f => f.name).join(", ")}`);
      return;
    }
    
    setAttachedFiles(prev => [...prev, ...files]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const isImageFile = (file: File | FileAttachment): boolean => {
    if (file instanceof File) {
      return file.type.startsWith('image/');
    } else {
      return file.file_type.startsWith('image/');
    }
  };

  const getFilePreviewUrl = (file: File): string => {
    return URL.createObjectURL(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment(e as unknown as React.FormEvent);
    }
    // Allow Shift+Enter for line breaks (default behavior)
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    
    // Check all clipboard items for files
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Handle files (images, documents, etc.)
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      // Check file size limit (50MB per file)
      const oversizedFiles = files.filter(f => f.size > 52428800);
      if (oversizedFiles.length > 0) {
        toast.error(`Some files exceed 50MB limit: ${oversizedFiles.map(f => f.name).join(", ")}`);
        return;
      }
      
      setAttachedFiles(prev => [...prev, ...files]);
      toast.success(`${files.length} file${files.length > 1 ? 's' : ''} attached`);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    // Format as "Jan 12, 2026 at 3:45 PM"
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) + " at " + date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="flex flex-col h-full bg-[var(--theme-bg-surface)]">
      {/* Comments List */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="text-center py-12 text-sm text-[var(--theme-text-muted)]">
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--theme-text-muted)]">No comments yet</p>
            <p className="text-xs text-[var(--theme-text-muted)] mt-2">
              BD and PD can add instructions or updates for Operations here
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                {/* User Avatar */}
                <div className="flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-[var(--theme-action-primary-bg)] text-white flex items-center justify-center text-sm font-semibold">
                    {comment.user_name.charAt(0).toUpperCase()}
                  </div>
                </div>

                {/* Comment Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-[var(--theme-text-primary)]">
                      {comment.user_name}
                    </span>
                    <span className="text-[10px] text-[var(--theme-text-muted)] uppercase font-bold tracking-wide">
                      {comment.department}
                    </span>
                    <span className="text-xs text-[var(--theme-text-muted)]">
                      {formatDateTime(comment.created_at)}
                    </span>
                  </div>
                  {comment.message && (
                    <p className="text-sm text-[var(--theme-text-secondary)] leading-relaxed whitespace-pre-wrap break-words">
                      {comment.message}
                    </p>
                  )}
                  
                  {/* File Attachments */}
                  {comment.attachments && comment.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {comment.attachments.map((file, idx) => (
                        isImageFile(file) ? (
                          // Image Preview
                          <a
                            key={idx}
                            href={file.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-fit max-w-md rounded-lg overflow-hidden border border-[var(--theme-border-default)] hover:border-[var(--theme-action-primary-bg)] transition-colors group"
                          >
                            <img
                              src={file.file_url}
                              alt={file.file_name}
                              className="max-w-full h-auto max-h-80 object-contain bg-[var(--theme-bg-page)]"
                            />
                            <div className="px-3 py-2 bg-[var(--theme-bg-surface)] border-t border-[var(--theme-border-default)] flex items-center gap-2">
                              <FileText className="w-4 h-4 text-[var(--theme-text-muted)] group-hover:text-[var(--theme-action-primary-bg)]" />
                              <span className="flex-1 text-xs font-medium text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-action-primary-bg)] truncate">
                                {file.file_name}
                              </span>
                              <span className="text-xs text-[var(--theme-text-muted)]">
                                ({formatFileSize(file.file_size)})
                              </span>
                              <Download className="w-3.5 h-3.5 text-[var(--theme-text-muted)] group-hover:text-[var(--theme-action-primary-bg)]" />
                            </div>
                          </a>
                        ) : (
                          // Non-image File
                          <a
                            key={idx}
                            href={file.file_url}
                            download={file.file_name}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--theme-bg-page)] border border-[var(--theme-border-default)] hover:border-[var(--theme-action-primary-bg)] hover:bg-[var(--theme-status-success-bg)] transition-colors group text-sm"
                          >
                            <FileText className="w-4 h-4 text-[var(--theme-text-muted)] group-hover:text-[var(--theme-action-primary-bg)]" />
                            <span className="font-medium text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-action-primary-bg)]">
                              {file.file_name}
                            </span>
                            <span className="text-xs text-[var(--theme-text-muted)]">
                              ({formatFileSize(file.file_size)})
                            </span>
                            <Download className="w-3.5 h-3.5 text-[var(--theme-text-muted)] group-hover:text-[var(--theme-action-primary-bg)]" />
                          </a>
                        )
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comment Input Form - Fixed at bottom */}
      <div className="border-t border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] px-6 py-4">
        {/* Attached Files Preview */}
        {attachedFiles.length > 0 && (
          <div className="mb-3 space-y-2">
            {attachedFiles.map((file, idx) => (
              isImageFile(file) ? (
                // Image Preview
                <div
                  key={idx}
                  className="relative w-fit max-w-md rounded-lg overflow-hidden border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)]"
                >
                  <img
                    src={getFilePreviewUrl(file)}
                    alt={file.name}
                    className="max-w-full h-auto max-h-60 object-contain bg-[var(--theme-bg-page)]"
                  />
                  <div className="px-3 py-2 bg-[var(--theme-bg-surface)] border-t border-[var(--theme-border-default)] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--theme-text-muted)]" />
                    <span className="flex-1 text-xs font-medium text-[var(--theme-text-secondary)] truncate">
                      {file.name}
                    </span>
                    <span className="text-xs text-[var(--theme-text-muted)]">
                      ({formatFileSize(file.size)})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="p-1 rounded hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
                    >
                      <X className="w-4 h-4 text-[var(--theme-text-muted)]" />
                    </button>
                  </div>
                </div>
              ) : (
                // Non-image File
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--theme-bg-page)] border border-[var(--theme-border-default)] text-sm"
                >
                  <FileText className="w-4 h-4 text-[var(--theme-text-muted)]" />
                  <span className="flex-1 font-medium text-[var(--theme-text-secondary)] truncate">
                    {file.name}
                  </span>
                  <span className="text-xs text-[var(--theme-text-muted)]">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(idx)}
                    className="p-0.5 rounded hover:bg-[var(--theme-border-default)] transition-colors"
                  >
                    <X className="w-4 h-4 text-[var(--theme-text-muted)]" />
                  </button>
                </div>
              )
            ))}
          </div>
        )}
        
        <form onSubmit={handleSubmitComment} className="relative">
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            disabled={isSubmitting || isUploadingFiles}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            className="w-full pl-4 pr-24 py-3 rounded-lg border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] text-sm text-[var(--theme-text-secondary)] placeholder-[var(--theme-text-muted)] resize-none overflow-hidden focus:outline-none disabled:bg-[var(--theme-bg-surface-subtle)] disabled:cursor-not-allowed transition-colors min-h-[44px] max-h-[200px]"
          />
          
          {/* Action Buttons - Positioned at bottom-right, locked in place */}
          <div className="absolute right-2 bottom-3 flex items-center gap-1">
            {/* File Upload Button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting || isUploadingFiles}
              className="p-2 rounded-md text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-surface-subtle)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Attach files"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            
            {/* Send Button - Circular */}
            <button
              type="submit"
              disabled={(!newComment.trim() && attachedFiles.length === 0) || isSubmitting || isUploadingFiles}
              className="w-8 h-8 rounded-full bg-[var(--theme-action-primary-bg)] text-white flex items-center justify-center hover:bg-[#0D6558] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Send"
            >
              {isUploadingFiles ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}