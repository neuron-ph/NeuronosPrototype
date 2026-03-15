import { useState, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { useUser } from "../../hooks/useUser";
import { apiFetch } from "../../utils/api";
import { EntityPickerModal } from "./EntityPickerModal";
import { toast } from "sonner@2.0.3";

interface NewTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefilledEntity?: {
    entityType: string;
    entityId: string;
    entityName: string;
  } | null;
}

export function NewTicketModal({ isOpen, onClose, onSuccess, prefilledEntity }: NewTicketModalProps) {
  const { user } = useUser();
  const [ticketTypes, setTicketTypes] = useState<any[]>([]);
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
    const type = ticketTypes.find(t => t.code === typeCode);
    if (type) {
      setToDepartment(type.to_departments?.[0] || "");
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
      name: entity.quotation_name || entity.tracking_number || entity.id
    });
    setShowEntityPicker(false);
  };
  
  if (!isOpen) return null;
  
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "600px",
            maxHeight: "90vh",
            overflow: "auto"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: "24px",
            borderBottom: "1px solid #E5E9F0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#12332B" }}>
              Create New Ticket
            </h2>
            <button
              onClick={onClose}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                color: "#667085",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <X size={20} />
            </button>
          </div>
          
          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
            {/* Ticket Type */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#12332B", marginBottom: "8px" }}>
                Ticket Type *
              </label>
              <select
                value={ticketType}
                onChange={(e) => handleTicketTypeChange(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #E5E9F0",
                  fontSize: "14px",
                  color: "#12332B",
                  background: "#FFFFFF"
                }}
              >
                <option value="">Select ticket type...</option>
                {ticketTypes.map(type => (
                  <option key={type.code} value={type.code}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* To Department */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#12332B", marginBottom: "8px" }}>
                To Department *
              </label>
              <input
                type="text"
                value={toDepartment}
                readOnly
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #E5E9F0",
                  fontSize: "14px",
                  color: "#667085",
                  background: "#F9FAFB"
                }}
              />
              <p style={{ fontSize: "12px", color: "#667085", marginTop: "6px" }}>
                Auto-filled based on ticket type
              </p>
            </div>
            
            {/* Subject */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#12332B", marginBottom: "8px" }}>
                Subject *
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                placeholder="Brief description of the request..."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #E5E9F0",
                  fontSize: "14px",
                  color: "#12332B"
                }}
              />
            </div>
            
            {/* Description */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#12332B", marginBottom: "8px" }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide additional details..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #E5E9F0",
                  fontSize: "14px",
                  color: "#12332B",
                  fontFamily: "inherit",
                  resize: "vertical"
                }}
              />
            </div>
            
            {/* Priority */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#12332B", marginBottom: "8px" }}>
                Priority
              </label>
              <div style={{ display: "flex", gap: "12px" }}>
                {["Normal", "High", "Urgent"].map(p => (
                  <label
                    key={p}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="radio"
                      name="priority"
                      value={p}
                      checked={priority === p}
                      onChange={(e) => setPriority(e.target.value)}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "14px", color: "#12332B" }}>{p}</span>
                  </label>
                ))}
              </div>
            </div>
            
            {/* Related Entity */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#12332B", marginBottom: "8px" }}>
                Related To (Optional)
              </label>
              
              {linkedEntity ? (
                <div style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #E5E9F0",
                  background: "#F9FAFB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#667085", marginBottom: "4px" }}>
                      {linkedEntity.type.charAt(0).toUpperCase() + linkedEntity.type.slice(1)}
                    </div>
                    <div style={{ fontSize: "14px", color: "#12332B", fontWeight: 500 }}>
                      {linkedEntity.name || linkedEntity.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLinkedEntity(null)}
                    style={{
                      padding: "6px",
                      border: "none",
                      background: "transparent",
                      color: "#667085",
                      cursor: "pointer"
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                    <select
                      value={selectedEntityType}
                      onChange={(e) => setSelectedEntityType(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #E5E9F0",
                        fontSize: "14px",
                        color: "#12332B"
                      }}
                    >
                      <option value="quotation">Quotation</option>
                      <option value="booking">Booking</option>
                      <option value="expense">Expense</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowEntityPicker(true)}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "8px",
                        border: "1px solid #E5E9F0",
                        background: "#FFFFFF",
                        color: "#12332B",
                        fontSize: "14px",
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                    >
                      <Plus size={16} />
                      Select
                    </button>
                  </div>
                </>
              )}
            </div>
            
            {/* Footer */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "1px solid #E5E9F0",
                  background: "#FFFFFF",
                  color: "#667085",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: isCreating ? "#9CA3AF" : "#0F766E",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: isCreating ? "not-allowed" : "pointer"
                }}
              >
                {isCreating ? "Creating..." : "Create Ticket"}
              </button>
            </div>
          </form>
        </div>
      </div>
      
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