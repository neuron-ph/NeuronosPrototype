import { useState, useEffect } from "react";
import { FileText, Plus, Loader2, Filter, CheckSquare, Square, ChevronRight, Printer, Mail } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import type { Project } from "../../types/pricing";
import type { EVoucher } from "../../types/evoucher";

interface ProjectBillingsTabProps {
  project: Project;
  currentUser: any;
}

export function ProjectBillingsTab({ project, currentUser }: ProjectBillingsTabProps) {
  const [billings, setBillings] = useState<EVoucher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // Expanded states for statements
  const [expandedStatements, setExpandedStatements] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchBillings();
  }, [project.project_number]);

  const fetchBillings = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.from('evouchers').select('*').eq('transaction_type', 'billing').eq('project_number', project.project_number);
      
      if (!error && data) {
        setBillings(data);
      }
    } catch (error) {
      console.error("Error fetching billings:", error);
      toast.error("Failed to load billings");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleImportFromQuotation = async () => {
    if (isImporting) return;
    
    setIsImporting(true);
    toast.loading("Generating invoice from quotation charges...", { id: "import-billing" });
    
    try {
      // Generate invoice client-side: create billing evouchers from quotation charges
      const quotation = project.quotation;
      if (!quotation?.selling_price_charges?.length) {
        throw new Error("No quotation charges found to generate billing from");
      }
      
      const billingItems = quotation.selling_price_charges.map((charge: any) => ({
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        transaction_type: 'billing',
        project_number: project.project_number,
        customer_id: project.customer_id,
        customer_name: project.customer_name,
        description: charge.description || charge.charge_name,
        amount: charge.amount || charge.total || 0,
        status: 'Draft',
        created_at: new Date().toISOString(),
      }));
      
      const { error: insertError } = await supabase.from('evouchers').insert(billingItems);
      
      if (!insertError) {
        toast.success("Invoice generated successfully!", { id: "import-billing" });
        fetchBillings(); // Refresh the list
      } else {
        toast.error(insertError.message || "Failed to generate invoice", { id: "import-billing" });
      }
    } catch (error) {
      console.error("Error importing billing:", error);
      toast.error("An error occurred", { id: "import-billing" });
    } finally {
      setIsImporting(false);
    }
  };

  // Group billings
  const unbilledItems = billings.filter(b => !b.statement_reference && b.status === 'draft');
  
  const statements = billings.reduce((acc, curr) => {
    if (curr.statement_reference) {
      if (!acc[curr.statement_reference]) {
        acc[curr.statement_reference] = [];
      }
      acc[curr.statement_reference].push(curr);
    }
    return acc;
  }, {} as Record<string, EVoucher[]>);

  // Sorting statements by date (newest first)
  const sortedStatementKeys = Object.keys(statements).sort((a, b) => {
    const dateA = new Date(statements[a][0].created_at).getTime();
    const dateB = new Date(statements[b][0].created_at).getTime();
    return dateB - dateA;
  });

  // Calculate totals
  const totalBilled = Object.values(statements).flat().reduce((sum, item) => sum + item.amount, 0);
  const totalUnbilled = unbilledItems.reduce((sum, item) => sum + item.amount, 0);
  const totalProjectBillings = totalBilled + totalUnbilled;

  // Actions
  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === unbilledItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unbilledItems.map(i => i.id)));
    }
  };

  const generateStatement = async () => {
    if (selectedIds.size === 0) return;
    
    setIsGenerating(true);
    try {
      // 1. Generate Statement ID
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
      const statementRef = `SOA-${dateStr}-${randomSuffix}`;
      
      // 2. Update each selected voucher
      const updatePromises = Array.from(selectedIds).map(id => 
        supabase.from('evouchers').update({
          statement_reference: statementRef,
          status: "pending", 
          billing_status: "billed",
          remaining_balance: billings.find(b => b.id === id)?.amount || 0
        }).eq('id', id)
      );

      await Promise.all(updatePromises);
      
      toast.success(`Statement ${statementRef} generated successfully!`);
      setSelectedIds(new Set());
      fetchBillings(); // Refresh
      
    } catch (error) {
      console.error("Error generating statement:", error);
      toast.error("Failed to generate statement");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleStatement = (ref: string) => {
    const newExpanded = new Set(expandedStatements);
    if (newExpanded.has(ref)) {
      newExpanded.delete(ref);
    } else {
      newExpanded.add(ref);
    }
    setExpandedStatements(newExpanded);
  };

  const [isFinalizing, setIsFinalizing] = useState<string | null>(null);

  const handleFinalize = async (statementRef: string) => {
    if (isFinalizing) return;
    
    // Confirm dialog (simple browser confirm for now, or use toast)
    if (!window.confirm("Are you sure you want to finalize this statement? This will post to the General Ledger and cannot be undone.")) {
      return;
    }

    setIsFinalizing(statementRef);
    const toastId = toast.loading("Finalizing statement...", { id: "finalize-stmt" });

    try {
      const { error: finalizeError } = await supabase.from('evouchers').update({
        status: 'posted',
        billing_status: 'posted',
        finalized_at: new Date().toISOString(),
        finalized_by: currentUser?.id,
      }).eq('statement_reference', statementRef);

      if (!finalizeError) {
        toast.success("Statement Finalized & Posted to Ledger!", { id: "finalize-stmt" });
        fetchBillings();
      } else {
        throw new Error(finalizeError.message || "Failed to finalize");
      }
    } catch (error) {
      console.error("Error finalizing:", error);
      toast.error(error instanceof Error ? error.message : "Failed to finalize", { id: "finalize-stmt" });
    } finally {
      setIsFinalizing(null);
    }
  };

  const formatCurrency = (amount: number, currency: string = "PHP") => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  return (
    <div style={{
      flex: 1,
      overflow: "auto",
      backgroundColor: "#FAFBFC"
    }}>
      <div style={{ padding: "32px 48px", maxWidth: "1400px", margin: "0 auto" }}>
        
        {/* Header Bar */}
        <div style={{
          backgroundColor: "white",
          border: "1px solid var(--neuron-ui-border, #E5E7EB)",
          borderRadius: "8px",
          marginBottom: "24px"
        }}>
          {/* Title Section */}
          <div style={{
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            borderBottom: "1px solid var(--neuron-ui-border, #E5E7EB)"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <FileText size={18} style={{ color: "var(--neuron-brand-green, #0F766E)" }} />
              <h2 style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--neuron-brand-green, #0F766E)",
                margin: 0
              }}>
                Project Billings
              </h2>
            </div>
            <p style={{
              fontSize: "13px",
              color: "var(--neuron-ink-muted, #6B7280)",
              margin: 0,
              flex: 1
            }}>
              Manage unbilled charges and generate Billing Statements (SOA)
            </p>
          </div>
          
          {/* Action Bar / Filters Placeholder */}
          <div style={{
            padding: "12px 24px",
            backgroundColor: "#FAFBFC",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px"
          }}>
             <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--neuron-ink-muted, #6B7280)",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                <Filter size={14} />
                Actions
              </div>

             {selectedIds.size > 0 && (
              <button
                onClick={generateStatement}
                disabled={isGenerating}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 12px",
                  backgroundColor: "#0F766E",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: isGenerating ? "not-allowed" : "pointer",
                  opacity: isGenerating ? 0.7 : 1
                }}
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                Generate SOA ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Stacked Layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
          
          {/* Top: Unbilled Charges */}
          <div style={{ 
            backgroundColor: "white", 
            border: "1px solid var(--neuron-ui-border, #E5E7EB)", 
            borderRadius: "8px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            height: "fit-content"
          }}>
            <div style={{ 
              padding: "20px 24px", 
              borderBottom: "1px solid var(--neuron-ui-border, #E5E7EB)",
              backgroundColor: "#F8FBFB",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <h3 style={{ 
                fontSize: "14px", 
                fontWeight: 600, 
                color: "var(--neuron-brand-green, #0F766E)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                margin: 0
              }}>
                Unbilled Charges ({unbilledItems.length})
              </h3>
            </div>
            
            {isLoading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#6B7280" }}>
                <Loader2 className="animate-spin inline-block mr-2" size={20} /> Loading charges...
              </div>
            ) : unbilledItems.length === 0 ? (
               <div style={{ padding: "40px", textAlign: "center", color: "#6B7280" }}>
                <p>No unbilled charges found.</p>
                <p style={{ fontSize: "12px", marginTop: "8px", marginBottom: "20px" }}>
                  Approved billable expenses and quotation items will appear here.
                </p>
                
                {/* Action to generate from quotation if empty */}
                {(project.charge_categories || []).length > 0 && (
                  <button
                    onClick={handleImportFromQuotation}
                    disabled={isImporting}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 16px",
                      backgroundColor: "white",
                      border: "1px solid var(--neuron-brand-green, #0F766E)",
                      borderRadius: "6px",
                      color: "var(--neuron-brand-green, #0F766E)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isImporting ? "not-allowed" : "pointer",
                      opacity: isImporting ? 0.7 : 1
                    }}
                  >
                    {isImporting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Import Charges from Quotation
                  </button>
                )}
              </div>
            ) : (
              <div style={{ maxHeight: "500px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, backgroundColor: "#F9FAFB", zIndex: 10 }}>
                    <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                      <th style={{ padding: "12px 16px", width: "40px" }}>
                        <button 
                          onClick={handleSelectAll}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#374151" }}
                        >
                          {selectedIds.size === unbilledItems.length && unbilledItems.length > 0 ? (
                            <CheckSquare size={18} />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </th>
                      <th style={{ textAlign: "left", padding: "12px 16px", fontSize: "11px", fontWeight: 600, color: "var(--neuron-ink-muted, #6B7280)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Particulars</th>
                      <th style={{ textAlign: "right", padding: "12px 16px", fontSize: "11px", fontWeight: 600, color: "var(--neuron-ink-muted, #6B7280)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unbilledItems.map(item => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <button 
                            onClick={() => handleToggleSelect(item.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: selectedIds.has(item.id) ? "#0F766E" : "#D1D5DB" }}
                          >
                            {selectedIds.has(item.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>{item.purpose || "Service Charge"}</div>
                          <div style={{ fontSize: "12px", color: "#6B7280" }}>{item.voucher_number}</div>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontSize: "14px", fontWeight: 600, color: "#374151" }}>
                          {formatCurrency(item.amount, item.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bottom: Billing Statements */}
          <div style={{ 
            backgroundColor: "white", 
            border: "1px solid var(--neuron-ui-border, #E5E7EB)", 
            borderRadius: "8px",
            overflow: "hidden"
          }}>
            <div style={{ 
              padding: "20px 24px", 
              borderBottom: "1px solid var(--neuron-ui-border, #E5E7EB)",
              backgroundColor: "#F8FBFB",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
               <h3 style={{ 
                fontSize: "14px", 
                fontWeight: 600, 
                color: "var(--neuron-brand-green, #0F766E)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                margin: 0
              }}>
                Generated Statements ({sortedStatementKeys.length})
              </h3>
            </div>
            
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {sortedStatementKeys.length === 0 ? (
                <div style={{ 
                  padding: "40px", 
                  textAlign: "center", 
                  border: "1px dashed #E5E7EB", 
                  borderRadius: "12px",
                  backgroundColor: "#F9FAFB",
                  color: "#6B7280"
                }}>
                  No statements generated yet.
                </div>
              ) : (
                sortedStatementKeys.map(ref => {
                  const items = statements[ref];
                  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
                  const remainingAmount = items.reduce((sum, i) => sum + (i.remaining_balance ?? i.amount), 0);
                  const isPaid = remainingAmount <= 0.01; // Floating point tolerance
                  const isPosted = items.some(i => i.status === "Posted" || i.posted_to_ledger);
                  const isExpanded = expandedStatements.has(ref);
                  const date = new Date(items[0].updated_at || items[0].created_at).toLocaleDateString();

                  return (
                    <div key={ref} style={{ 
                      backgroundColor: "white", 
                      border: "1px solid #E5E7EB", 
                      borderRadius: "12px",
                      overflow: "hidden",
                      transition: "all 0.2s"
                    }}>
                      {/* Statement Header */}
                      <div 
                        onClick={() => toggleStatement(ref)}
                        style={{ 
                          padding: "16px 20px", 
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          backgroundColor: isExpanded ? "#F8FBFB" : "white"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ 
                            color: "#6B7280", 
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.2s"
                          }}>
                            <ChevronRight size={18} />
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ fontSize: "14px", fontWeight: 600, color: "#12332B" }}>{ref}</div>
                              {isPosted && (
                                <span style={{ fontSize: "10px", fontWeight: 600, color: "#0F766E", backgroundColor: "#E6FFFA", padding: "2px 6px", borderRadius: "4px", border: "1px solid #B2F5EA" }}>
                                  POSTED
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "12px", color: "#6B7280" }}>{date} • {items.length} items</div>
                          </div>
                        </div>
                        
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: "#12332B" }}>
                            {formatCurrency(totalAmount)}
                          </div>
                          <div style={{ fontSize: "11px", fontWeight: 600 }}>
                            {isPaid ? (
                              <span style={{ color: "#059669", backgroundColor: "#D1FAE5", padding: "2px 6px", borderRadius: "4px" }}>PAID</span>
                            ) : remainingAmount < totalAmount ? (
                              <span style={{ color: "#D97706", backgroundColor: "#FEF3C7", padding: "2px 6px", borderRadius: "4px" }}>PARTIAL</span>
                            ) : (
                              <span style={{ color: "#DC2626", backgroundColor: "#FEE2E2", padding: "2px 6px", borderRadius: "4px" }}>UNPAID</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {isExpanded && (
                        <div style={{ borderTop: "1px solid #E5E7EB", padding: "16px 20px", backgroundColor: "#FFFFFF" }}>
                          <table style={{ width: "100%", fontSize: "13px" }}>
                            <tbody>
                              {items.map(item => (
                                <tr key={item.id}>
                                  <td style={{ padding: "6px 0", color: "#374151" }}>{item.purpose}</td>
                                  <td style={{ padding: "6px 0", textAlign: "right", color: "#6B7280" }}>{formatCurrency(item.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot style={{ borderTop: "1px dashed #E5E7EB" }}>
                              <tr>
                                <td style={{ padding: "12px 0", fontWeight: 600, color: "#12332B" }}>Total Due</td>
                                <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 600, color: "#12332B" }}>{formatCurrency(totalAmount)}</td>
                              </tr>
                              <tr>
                                <td style={{ padding: "4px 0", fontWeight: 500, color: "#6B7280" }}>Balance Remaining</td>
                                <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, color: "#C94F3D" }}>{formatCurrency(remainingAmount)}</td>
                              </tr>
                            </tfoot>
                          </table>
                          
                          <div style={{ marginTop: "16px", display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
                             {!isPosted && (
                               <button 
                                 onClick={() => handleFinalize(ref)}
                                 disabled={isFinalizing === ref}
                                 style={{
                                   display: "flex", alignItems: "center", gap: "6px",
                                   padding: "6px 12px", fontSize: "12px", fontWeight: 600,
                                   backgroundColor: "#0F766E", border: "none", borderRadius: "6px",
                                   color: "white", cursor: isFinalizing === ref ? "not-allowed" : "pointer",
                                   opacity: isFinalizing === ref ? 0.7 : 1,
                                   marginRight: "auto" // Push to left
                                 }}
                               >
                                 {isFinalizing === ref ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
                                 Finalize & Post
                               </button>
                             )}
                             
                             <button style={{
                               display: "flex", alignItems: "center", gap: "6px",
                               padding: "6px 12px", fontSize: "12px", fontWeight: 500,
                               backgroundColor: "white", border: "1px solid #D1D5DB", borderRadius: "6px",
                               color: "#374151", cursor: "pointer"
                             }}>
                               <Printer size={14} /> Print SOA
                             </button>
                             <button style={{
                               display: "flex", alignItems: "center", gap: "6px",
                               padding: "6px 12px", fontSize: "12px", fontWeight: 500,
                               backgroundColor: "white", border: "1px solid #D1D5DB", borderRadius: "6px",
                               color: "#374151", cursor: "pointer"
                             }}>
                               <Mail size={14} /> Email Client
                             </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Project Billings Total */}
          <div style={{
            backgroundColor: "white",
            border: "1px solid var(--neuron-ui-border, #E5E7EB)",
            borderRadius: "8px",
            padding: "24px"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div>
                <div style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--neuron-ink-muted, #6B7280)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "4px"
                }}>
                  Total Project Billings
                </div>
                <div style={{
                  fontSize: "13px",
                  color: "var(--neuron-ink-muted, #6B7280)"
                }}>
                  Combined total of all billed and unbilled charges
                </div>
              </div>

              <div style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "#12332B"
              }}>
                {formatCurrency(totalProjectBillings)}
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}