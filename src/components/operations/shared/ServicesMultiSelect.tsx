import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Check } from "lucide-react";

interface ServicesMultiSelectProps {
  label: string;
  selectedServices: string[];
  onServicesChange: (services: string[]) => void;
  availableServices: string[];
  placeholder?: string;
  required?: boolean;
}

export function ServicesMultiSelect({
  label,
  selectedServices,
  onServicesChange,
  availableServices,
  placeholder = "Select services...",
  required = false,
}: ServicesMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleService = (service: string) => {
    if (selectedServices.includes(service)) {
      onServicesChange(selectedServices.filter((s) => s !== service));
    } else {
      onServicesChange([...selectedServices, service]);
    }
  };

  const removeService = (service: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onServicesChange(selectedServices.filter((s) => s !== service));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label
        className="block mb-1.5"
        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
      >
        {label}
        {required && <span style={{ color: "#C94F3D" }}> *</span>}
      </label>

      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px] cursor-pointer min-h-[42px] flex items-center flex-wrap gap-2"
        style={{
          border: "1px solid var(--neuron-ui-border)",
          backgroundColor: "var(--theme-bg-surface)",
          color: "var(--neuron-ink-primary)",
        }}
      >
        {selectedServices.length === 0 ? (
          <span className="text-[var(--theme-text-muted)]">{placeholder}</span>
        ) : (
          selectedServices.map((service) => (
            <span
              key={service}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
              style={{
                backgroundColor: "#0F766E20",
                color: "var(--theme-action-primary-bg)",
                border: "1px solid #0F766E40",
              }}
            >
              {service}
              <button
                type="button"
                onClick={(e) => removeService(service, e)}
                className="hover:bg-[var(--theme-action-primary-bg)]/20 rounded-full p-0.5 transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))
        )}
        <ChevronDown
          size={16}
          className="ml-auto flex-shrink-0"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            color: "var(--theme-text-muted)",
          }}
        />
      </div>

      {isOpen && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
          style={{
            border: "1px solid var(--neuron-ui-border)",
            backgroundColor: "var(--theme-bg-surface)",
            maxHeight: "240px",
            overflowY: "auto",
          }}
        >
          {availableServices.length === 0 ? (
            <div className="px-3.5 py-2.5 text-[13px] text-[var(--theme-text-muted)]">
              No services available
            </div>
          ) : (
            availableServices.map((service) => {
              const isSelected = selectedServices.includes(service);
              return (
                <div
                  key={service}
                  onClick={() => toggleService(service)}
                  className="px-3.5 py-2.5 text-[13px] cursor-pointer flex items-center justify-between hover:bg-[var(--theme-action-primary-bg)]/5 transition-colors"
                  style={{
                    backgroundColor: isSelected ? "#0F766E10" : "transparent",
                    color: isSelected ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)",
                  }}
                >
                  <span>{service}</span>
                  {isSelected && (
                    <Check size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
