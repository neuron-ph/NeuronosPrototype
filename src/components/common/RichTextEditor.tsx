import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Code, List, ListOrdered,
  Heading1, Heading2, Heading3, Minus, Quote,
} from "lucide-react";

type ToolbarGroup = Array<{
  title: string;
  icon: React.ElementType;
  action: (e: Editor) => void;
  isActive?: (e: Editor) => boolean;
}>;

const TOOLBAR_GROUPS: ToolbarGroup[] = [
  [
    { title: "Heading 1", icon: Heading1, action: e => e.chain().focus().toggleHeading({ level: 1 }).run(), isActive: e => e.isActive("heading", { level: 1 }) },
    { title: "Heading 2", icon: Heading2, action: e => e.chain().focus().toggleHeading({ level: 2 }).run(), isActive: e => e.isActive("heading", { level: 2 }) },
    { title: "Heading 3", icon: Heading3, action: e => e.chain().focus().toggleHeading({ level: 3 }).run(), isActive: e => e.isActive("heading", { level: 3 }) },
  ],
  [
    { title: "Bold",       icon: Bold,   action: e => e.chain().focus().toggleBold().run(),       isActive: e => e.isActive("bold") },
    { title: "Italic",     icon: Italic, action: e => e.chain().focus().toggleItalic().run(),     isActive: e => e.isActive("italic") },
    { title: "Code",       icon: Code,   action: e => e.chain().focus().toggleCode().run(),       isActive: e => e.isActive("code") },
    { title: "Blockquote", icon: Quote,  action: e => e.chain().focus().toggleBlockquote().run(), isActive: e => e.isActive("blockquote") },
  ],
  [
    { title: "Bullet list",   icon: List,        action: e => e.chain().focus().toggleBulletList().run(),  isActive: e => e.isActive("bulletList") },
    { title: "Numbered list", icon: ListOrdered, action: e => e.chain().focus().toggleOrderedList().run(), isActive: e => e.isActive("orderedList") },
  ],
  [
    { title: "Separator", icon: Minus, action: e => e.chain().focus().setHorizontalRule().run() },
  ],
];

function RichToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "2px", padding: "5px 8px",
      borderBottom: "1px solid var(--neuron-ui-border)",
      background: "var(--neuron-bg-page)", flexShrink: 0,
    }}>
      {TOOLBAR_GROUPS.map((group, gi) => (
        <div key={gi} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          {gi > 0 && (
            <div style={{ width: 1, height: 16, background: "var(--neuron-ui-border)", margin: "0 4px", flexShrink: 0 }} />
          )}
          {group.map(({ title, icon: Icon, action, isActive }) => {
            const active = isActive?.(editor) ?? false;
            return (
              <button
                key={title}
                title={title}
                type="button"
                onMouseDown={e => { e.preventDefault(); action(editor); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, borderRadius: "5px", border: "none",
                  cursor: "pointer", flexShrink: 0,
                  background: active ? "color-mix(in oklch, var(--neuron-brand-green) 12%, transparent)" : "none",
                  color: active ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "var(--neuron-state-hover)";
                    (e.currentTarget as HTMLElement).style.color = "var(--neuron-ink-primary)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "none";
                    (e.currentTarget as HTMLElement).style.color = "var(--neuron-ink-muted)";
                  }
                }}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface RichTextEditorProps {
  value: string;                 // HTML
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number | string;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 160,
  disabled = false,
}: RichTextEditorProps) {
  // Refs avoid stale closures inside onUpdate.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      onChangeRef.current(html);
    },
  });

  // Sync external value changes (e.g. when a quotation is loaded after mount).
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      border: "1px solid var(--neuron-ui-border)", borderRadius: "6px",
      overflow: "hidden", background: "var(--neuron-bg-elevated)",
    }}>
      {!disabled && <RichToolbar editor={editor} />}
      <div
        className="memo-editor"
        style={{ minHeight, overflowY: "auto", cursor: disabled ? "default" : "text" }}
        onClick={() => !disabled && editor?.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/**
 * Read-only HTML renderer styled with the same typography as the editor.
 * Trusts the input — only render values produced by RichTextEditor.
 */
export function RichTextDisplay({ html, emptyText }: { html: string; emptyText?: string }) {
  const trimmed = (html || "").trim();
  if (!trimmed || trimmed === "<p></p>") {
    return (
      <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", fontStyle: "italic", margin: 0 }}>
        {emptyText ?? "—"}
      </p>
    );
  }
  return (
    <div className="memo-editor">
      <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
