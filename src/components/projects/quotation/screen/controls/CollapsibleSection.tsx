import React, { useState, useId } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({ title, icon, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className="border-b border-[var(--theme-border-default)] last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="w-full flex items-center justify-between p-6 hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[var(--theme-text-muted)] shrink-0">{icon}</span>
          <h4 className="font-bold text-[var(--theme-text-primary)] text-sm select-none">{title}</h4>
        </div>
        <div className={`text-[var(--theme-text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDown size={20} />
        </div>
      </button>

      <div
        id={contentId}
        role="region"
        aria-label={title}
        className={`grid transition-all duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
