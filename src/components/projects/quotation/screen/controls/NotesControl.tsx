import React from "react";

interface NotesControlProps {
  value: string;
  onChange: (text: string) => void;
}

export function NotesControl({ value, onChange }: NotesControlProps) {
  return (
    <div className="space-y-2">
      <label htmlFor="client-note-textarea" className="sr-only">
        Client note
      </label>
      <textarea
        id="client-note-textarea"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-32 px-3.5 py-2.5 text-sm border border-[var(--theme-border-default)] rounded-lg focus:border-[var(--theme-action-primary-bg)] focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] outline-none resize-none transition-all placeholder:text-[var(--theme-text-muted)] bg-[var(--theme-bg-surface)]"
        placeholder="Enter custom terms and conditions here..."
      />
      <p className="text-xs text-[var(--theme-text-muted)] px-1">
        Plain text. Line breaks are preserved. Leave empty to use default standard terms.
      </p>
    </div>
  );
}
