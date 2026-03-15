import { X, FileText, AlertCircle, Building2, User, Calendar, Plus, Link2, Package, Ship, Plane, Truck, FileCheck, FileQuestion, Ticket } from "lucide-react";
import { useState, useEffect } from "react";
import type { TicketType } from "../../types/ticketing";
import { apiFetch } from "../../utils/api";
import { EntityPickerModal } from "./EntityPickerModal";
import { CustomDropdown } from "../bd/CustomDropdown";
import { toast } from "sonner@2.0.3";
import { useUser } from "../../hooks/useUser";

interface NewTicketPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefilledEntity?: {
    entityType: string;
    entityId: string;
    entityName: string;
  } | null;
}

export function NewTicketPanel({ isOpen, onClose, onSuccess, prefilledEntity }: NewTicketPanelProps) {
  const { user } = useUser();
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [ticketType, setTicketType] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [toDepartment, setToDepartment] = useState("");
  const [linkedEntity, setLinkedEntity] = useState<any>(null);
  const [showEntityPicker, setShowEntityPicker] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState("quotation");
  
  // Load ticket types
  useEffect(() => {
    if (isOpen) {
      loadTicketTypes();
    }
  }, [isOpen]);
  
  // Pre-fill entity if provided
  useEffect(() => {
    if (prefilledEntity) {
      setLinkedEntity({
        type: prefilledEntity.entityType,
        id: prefilledEntity.entityId,
        name: prefilledEntity.entityName
      });
      setSelectedEntityType(prefilledEntity.entityType);
    }
  }, [prefilledEntity]);
  
  const loadTicketTypes = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch(`/ticket-types`);
      const result = await response.json();
      if (result.success) {
        setTicketTypes(result.data);
      }
    } catch (error) {
      console.error("Failed to load ticket types:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleTicketTypeChange = (typeCode: string) => {
    setTicketType(typeCode);
    const type = ticketTypes.find(t => t.id === typeCode);
    if (type) {
      setToDepartment(type.default_to_department || "");
      setPriority(type.default_priority || "Normal");
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!ticketType || !subject || !toDepartment) {
      toast.error("Please fill all required fields");
      return;
    }
    
    setIsCreating(true);
    try {
      const response = await apiFetch(`/tickets`, {
        method: "POST",
        body: JSON.stringify({
          ticket_type: ticketType,
          subject,
          description,
          priority,
          from_department: user?.department || "",
          to_department: toDepartment,
          created_by: user?.id || "",
          created_by_name: user?.name || "",
          related_entities: linkedEntity ? [{
            type: linkedEntity.type,
            id: linkedEntity.id,
            name: linkedEntity.name
          }] : []
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success("Ticket created successfully");
        onSuccess();
        resetForm();
        onClose();
      } else {
        toast.error(result.error || "Failed to create ticket");
      }
    } catch (error) {
      console.error("Failed to create ticket:", error);
      toast.error("Failed to create ticket");
    } finally {
      setIsCreating(false);
    }
  };
  
  const resetForm = () => {
    setTicketType("");
    setSubject("");
    setDescription("");
    setPriority("Normal");
    setToDepartment("");
    setLinkedEntity(null);
  };
  
  const handleEntitySelect = (entity: any) => {
    setLinkedEntity({
      type: selectedEntityType,
      id: entity.id,
      name: entity.name
    });
    setShowEntityPicker(false);
  };
  
  if (!isOpen) return null;
  
  const isFormValid = ticketType !== "" && subject.trim() !== "" && toDepartment !== "";
  
  const selectedTypeData = ticketTypes.find(t => t.id === ticketType);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black z-40 transition-opacity"
        onClick={onClose}
        style={{ 
          backdropFilter: "blur(2px)",
          backgroundColor: "rgba(18, 51, 43, 0.15)"
        }}
      />

      {/* Side Panel */}
      <div 
        className="fixed right-0 top-0 h-full w-[680px] bg-white z-50 shadow-2xl overflow-hidden flex flex-col"
        style={{
          animation: "slideIn 0.3s ease-out",
          border: "1px solid var(--neuron-ui-border)",
        }}
      >
        {/* Header */}
        <div 
          className="px-12 py-8 border-b"
          style={{ 
            borderColor: "var(--neuron-ui-border)",
            backgroundColor: "#FFFFFF"
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "#E8F2EE" }}
              >
                <Ticket size={20} style={{ color: "#0F766E" }} />
              </div>
              <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#12332B" }}>
                Create New Ticket
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ 
                color: "var(--neuron-ink-muted)",
                backgroundColor: "transparent"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <X size={20} />
            </button>
          </div>
          <p style={{ fontSize: "14px", color: "#667085" }}>
            Submit a request to another department for assistance or action
          </p>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-auto px-12 py-8">
          <form onSubmit={handleSubmit} id="create-ticket-form">
            {/* Ticket Type Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={16} style={{ color: "#0F766E" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#12332B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Request Type
                </h3>
              </div>

              <div className="space-y-4">
                {/* Ticket Type */}
                <div>
                  <label 
                    htmlFor="ticket_type" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Ticket Type <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <CustomDropdown
                    value={ticketType}
                    onChange={handleTicketTypeChange}
                    options={ticketTypes.map(type => ({ value: type.id, label: type.name }))}
                    placeholder="Select ticket type..."
                  />
                  {selectedTypeData?.description && (
                    <p style={{ fontSize: "12px", color: "#667085", marginTop: "6px" }}>
                      {selectedTypeData.description}
                    </p>
                  )}
                </div>

                {/* To Department */}
                <div>
                  <label 
                    htmlFor="to_department" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    To Department <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <CustomDropdown
                    value={toDepartment}
                    onChange={setToDepartment}
                    options={[
                      "Business Development",
                      "Pricing",
                      "Operations",
                      "Finance",
                      "Documentation"
                    ]}
                    placeholder="Select department..."
                  />
                  {selectedTypeData?.default_to_department && (
                    <p style={{ fontSize: "12px", color: "#667085", marginTop: "6px" }}>
                      Suggested: {selectedTypeData.default_to_department}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Request Details Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={16} style={{ color: "#0F766E" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#12332B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Request Details
                </h3>
              </div>

              <div className="space-y-4">
                {/* Subject */}
                <div>
                  <label 
                    htmlFor="subject" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Subject <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <input
                    id="subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief description of the request..."
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)"
                    }}
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label 
                    htmlFor="description" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide additional details about your request..."
                    rows={4}
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px] resize-none"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)"
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Priority & Related Entity Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle size={16} style={{ color: "#0F766E" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#12332B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Additional Information
                </h3>
              </div>

              <div className="space-y-4">
                {/* Priority */}
                <div>
                  <label 
                    className="block mb-2"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Priority
                  </label>
                  <div className="flex gap-3">
                    {[
                      { value: "Normal", color: "#16A67C", bgColor: "#E8F5F0", borderColor: "#16A67C" },
                      { value: "High", color: "#E87A3D", bgColor: "#FEF0E6", borderColor: "#E87A3D" },
                      { value: "Urgent", color: "#E35858", bgColor: "#FEEAEA", borderColor: "#E35858" }
                    ].map(p => (
                      <label
                        key={p.value}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg cursor-pointer transition-all"
                        style={{
                          border: priority === p.value ? `2px solid ${p.borderColor}` : "1px solid var(--neuron-ui-border)",
                          backgroundColor: priority === p.value ? p.bgColor : "#FFFFFF",
                        }}
                      >
                        <div 
                          className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all"
                          style={{
                            borderColor: priority === p.value ? p.color : "#D1D5DB",
                            backgroundColor: "#FFFFFF"
                          }}
                        >
                          {priority === p.value && (
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                          )}
                        </div>
                        <span style={{ 
                          fontSize: "13px", 
                          fontWeight: priority === p.value ? 600 : 500,
                          color: priority === p.value ? p.color : "#12332B" 
                        }}>
                          {p.value}
                        </span>
                        <input
                          type="radio"
                          name="priority"
                          value={p.value}
                          checked={priority === p.value}
                          onChange={(e) => setPriority(e.target.value)}
                          className="sr-only"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* Related Entity */}
                <div>
                  <label 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Related To (Optional)
                  </label>
                  
                  {linkedEntity ? (
                    <div 
                      className="px-4 py-3 rounded-lg flex items-center justify-between"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "#F9FAFB"
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-8 h-8 rounded flex items-center justify-center"
                          style={{ backgroundColor: "#E8F2EE" }}
                        >
                          <Link2 size={14} style={{ color: "#0F766E" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: "11px", color: "#667085", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            {linkedEntity.type}
                          </div>
                          <div style={{ fontSize: "13px", color: "#12332B", fontWeight: 500 }}>
                            {linkedEntity.name || linkedEntity.id}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLinkedEntity(null)}
                        className="w-7 h-7 rounded flex items-center justify-center transition-colors"
                        style={{
                          color: "#667085",
                          backgroundColor: "transparent"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#E5E9F0";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <CustomDropdown
                          value={selectedEntityType}
                          onChange={(value) => setSelectedEntityType(value)}
                          options={[
                            { value: "quotation", label: "Quotation" },
                            { value: "booking", label: "Booking" },
                            { value: "expense", label: "Expense" }
                          ]}
                          placeholder="Select entity type..."
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEntityPicker(true)}
                        className="px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "#FFFFFF",
                          color: "#12332B",
                          fontSize: "13px",
                          fontWeight: 500
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "#FFFFFF";
                        }}
                      >
                        <Plus size={16} />
                        Select
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div 
          className="px-12 py-6 border-t flex items-center justify-end gap-3"
          style={{ 
            borderColor: "var(--neuron-ui-border)",
            backgroundColor: "#FFFFFF"
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg transition-colors"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "#FFFFFF",
              color: "var(--neuron-ink-secondary)",
              fontSize: "14px",
              fontWeight: 500
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#FFFFFF";
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-ticket-form"
            disabled={!isFormValid || isCreating}
            className="px-6 py-2.5 rounded-lg transition-all flex items-center gap-2"
            style={{
              backgroundColor: (isFormValid && !isCreating) ? "#0F766E" : "#D1D5DB",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 600,
              border: "none",
              cursor: (isFormValid && !isCreating) ? "pointer" : "not-allowed",
              opacity: (isFormValid && !isCreating) ? 1 : 0.6
            }}
            onMouseEnter={(e) => {
              if (isFormValid && !isCreating) {
                e.currentTarget.style.backgroundColor = "#0D6560";
              }
            }}
            onMouseLeave={(e) => {
              if (isFormValid && !isCreating) {
                e.currentTarget.style.backgroundColor = "#0F766E";
              }
            }}
          >
            <Ticket size={16} />
            {isCreating ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
      
      {/* Entity Picker Modal */}
      {showEntityPicker && (
        <EntityPickerModal
          isOpen={showEntityPicker}
          entityType={selectedEntityType}
          onSelect={handleEntitySelect}
          onClose={() => setShowEntityPicker(false)}
          currentUserId={user?.id}
        />
      )}
    </>
  );
}