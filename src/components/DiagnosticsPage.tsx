import { useState, useEffect } from "react";
import { RefreshCw, Database, Package, FileText, AlertCircle } from "lucide-react";
import { apiFetch } from "../utils/api";

export function DiagnosticsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch(`/projects`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setProjects(result.data);
        console.log('📊 All Projects Data:', result.data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const inspectProject = (project: any) => {
    setSelectedProject(project);
    console.log('🔍 Selected Project Details:', {
      id: project.id,
      project_number: project.project_number,
      linkedBookings: project.linkedBookings,
      booking_status: project.booking_status,
      fullData: project
    });
  };

  return (
    <div style={{ 
      padding: "32px 48px",
      maxWidth: "1400px",
      margin: "0 auto",
      backgroundColor: "#F8FBFB",
      minHeight: "100vh"
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "32px"
      }}>
        <div>
          <h1 style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--neuron-ink-primary)",
            marginBottom: "8px",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            <Database size={28} style={{ color: "var(--neuron-brand-green)" }} />
            Database Diagnostics
          </h1>
          <p style={{
            fontSize: "14px",
            color: "var(--neuron-ink-muted)",
            margin: 0
          }}>
            Inspect project data and linked bookings in the database
          </p>
        </div>
        <button
          onClick={fetchProjects}
          disabled={isLoading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 24px",
            backgroundColor: "var(--neuron-brand-green)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.6 : 1
          }}
        >
          <RefreshCw size={16} style={{ animation: isLoading ? "spin 1s linear infinite" : "none" }} />
          Refresh Data
        </button>
      </div>

      {/* Projects List */}
      <div style={{
        backgroundColor: "white",
        border: "1px solid var(--neuron-ui-border)",
        borderRadius: "12px",
        padding: "24px"
      }}>
        <h2 style={{
          fontSize: "18px",
          fontWeight: 600,
          color: "var(--neuron-ink-primary)",
          marginBottom: "16px"
        }}>
          All Projects ({projects.length})
        </h2>

        {projects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px" }}>
            <Package size={48} style={{ color: "var(--neuron-ink-muted)", margin: "0 auto 16px" }} />
            <p style={{ color: "var(--neuron-ink-muted)" }}>No projects found</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {projects.map((project) => {
              const linkedBookingsCount = project.linkedBookings?.length || 0;
              const hasBookings = linkedBookingsCount > 0;

              return (
                <div
                  key={project.id}
                  style={{
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "8px",
                    padding: "16px 20px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    backgroundColor: selectedProject?.id === project.id ? "#E8F4F3" : "white"
                  }}
                  onClick={() => inspectProject(project)}
                  onMouseEnter={(e) => {
                    if (selectedProject?.id !== project.id) {
                      e.currentTarget.style.backgroundColor = "#F9FAFB";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedProject?.id !== project.id) {
                      e.currentTarget.style.backgroundColor = "white";
                    }
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--neuron-ink-primary)",
                        marginBottom: "4px"
                      }}>
                        {project.project_number}
                      </div>
                      <div style={{
                        fontSize: "13px",
                        color: "var(--neuron-ink-muted)"
                      }}>
                        {project.quotation_name || project.customer_name}
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {/* Booking Status Badge */}
                      <div style={{
                        padding: "6px 12px",
                        backgroundColor: hasBookings ? "#E8F4F3" : "#F3F4F6",
                        border: `1px solid ${hasBookings ? "var(--neuron-brand-green)" : "#E5E7EB"}`,
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: hasBookings ? "var(--neuron-brand-green)" : "#6B7280"
                      }}>
                        {linkedBookingsCount} {linkedBookingsCount === 1 ? 'Booking' : 'Bookings'}
                      </div>

                      {/* Warning if booking count doesn't match */}
                      {hasBookings && (
                        <AlertCircle 
                          size={20} 
                          style={{ color: "#F59E0B" }}
                          title="This project has bookings - check console for details"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Project Details */}
      {selectedProject && (
        <div style={{
          backgroundColor: "white",
          border: "2px solid var(--neuron-brand-green)",
          borderRadius: "12px",
          padding: "24px",
          marginTop: "24px"
        }}>
          <h2 style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--neuron-brand-green)",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <FileText size={20} />
            Selected Project: {selectedProject.project_number}
          </h2>

          {/* Linked Bookings */}
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)",
              marginBottom: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              Linked Bookings ({selectedProject.linkedBookings?.length || 0})
            </h3>
            
            {!selectedProject.linkedBookings || selectedProject.linkedBookings.length === 0 ? (
              <div style={{
                padding: "16px",
                backgroundColor: "#F9FAFB",
                borderRadius: "6px",
                fontSize: "14px",
                color: "var(--neuron-ink-muted)"
              }}>
                No bookings linked to this project
              </div>
            ) : (
              <div style={{
                backgroundColor: "#FEF3C7",
                border: "1px solid #FCD34D",
                borderRadius: "8px",
                padding: "16px"
              }}>
                {selectedProject.linkedBookings.map((booking: any, index: number) => (
                  <div key={index} style={{
                    padding: "12px",
                    backgroundColor: "white",
                    borderRadius: "6px",
                    marginBottom: index < selectedProject.linkedBookings.length - 1 ? "8px" : "0",
                    border: "1px solid #E5E7EB"
                  }}>
                    <div style={{ marginBottom: "8px" }}>
                      <strong>Booking ID:</strong> {booking.bookingId || booking.bookingNumber}
                    </div>
                    <div style={{ marginBottom: "8px" }}>
                      <strong>Service Type:</strong> {booking.serviceType || booking.bookingType || "N/A"}
                    </div>
                    <div style={{ marginBottom: "8px" }}>
                      <strong>Status:</strong> {booking.status}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>
                      <strong>Created:</strong> {new Date(booking.createdAt).toLocaleString()}
                    </div>
                    {booking.createdBy && (
                      <div style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>
                        <strong>Created By:</strong> {booking.createdBy}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Raw JSON */}
          <div>
            <h3 style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)",
              marginBottom: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              Raw JSON Data
            </h3>
            <pre style={{
              backgroundColor: "#1F2937",
              color: "#E5E7EB",
              padding: "16px",
              borderRadius: "8px",
              fontSize: "12px",
              overflow: "auto",
              maxHeight: "400px",
              fontFamily: "monospace"
            }}>
              {JSON.stringify(selectedProject, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{
        backgroundColor: "#DBEAFE",
        border: "1px solid #93C5FD",
        borderRadius: "12px",
        padding: "20px",
        marginTop: "24px"
      }}>
        <h3 style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "#1E40AF",
          marginBottom: "12px"
        }}>
          💡 How to Use This Diagnostic Tool
        </h3>
        <ul style={{
          fontSize: "14px",
          color: "#1E3A8A",
          margin: 0,
          paddingLeft: "20px"
        }}>
          <li>Click on any project to inspect its data</li>
          <li>Check the "Linked Bookings" count to see if unexpected bookings exist</li>
          <li>Yellow warning icons indicate projects with bookings</li>
          <li>All data is also logged to the browser console for detailed inspection</li>
          <li>Use the "Refresh Data" button to reload the latest data from the database</li>
        </ul>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
