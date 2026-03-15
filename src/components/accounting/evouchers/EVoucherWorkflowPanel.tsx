import { apiFetch } from "../../../utils/api";
import { useState } from "react";
import { CheckCircle, XCircle, Send, Ban, Loader2 } from "lucide-react";

interface EVoucherWorkflowPanelProps {
  evoucherId: string;
  currentStatus: string;
  userRole?: string; // "Accounting" or other departments
  onStatusChange?: () => void;
}

export function EVoucherWorkflowPanel({
  evoucherId,
  currentStatus,
  userRole,
  onStatusChange
}: EVoucherWorkflowPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const isAccounting = userRole === "Accounting";
  const canSubmit = currentStatus === "draft";
  const canApprove = isAccounting && currentStatus === "pending";
  const canReject = isAccounting && currentStatus === "pending";
  const canCancel = currentStatus === "draft" || currentStatus === "rejected";
  const canPostToLedger = isAccounting && currentStatus === "Approved" && currentStatus !== "Posted";

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Get current user from localStorage
      const userData = localStorage.getItem("neuron_user");
      const user = userData ? JSON.parse(userData) : null;

      if (!user) {
        alert("User not found. Please log in again.");
        return;
      }

      const response = await apiFetch(`/evouchers/${evoucherId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          user_name: user.name,
          user_role: user.department
        })
      });

      const result = await response.json();

      if (result.success) {
        alert("E-Voucher submitted for approval successfully!");
        onStatusChange?.();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Error submitting E-Voucher:", error);
      alert("Failed to submit E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!confirm("Are you sure you want to approve this E-Voucher?")) {
      return;
    }

    setIsSubmitting(true);
    try {
      const userData = localStorage.getItem("neuron_user");
      const user = userData ? JSON.parse(userData) : null;

      if (!user) {
        alert("User not found. Please log in again.");
        return;
      }

      const response = await apiFetch(`/evouchers/${evoucherId}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          user_name: user.name,
          user_role: user.department
        })
      });

      const result = await response.json();

      if (result.success) {
        alert("E-Voucher approved successfully! Use 'Post to Ledger' to create the accounting entry.");
        onStatusChange?.();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Error approving E-Voucher:", error);
      alert("Failed to approve E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePostToLedger = async () => {
    if (!confirm("Are you sure you want to post this E-Voucher to the accounting ledger? This action cannot be undone.")) {
      return;
    }

    setIsSubmitting(true);
    try {
      const userData = localStorage.getItem("neuron_user");
      const user = userData ? JSON.parse(userData) : null;

      if (!user) {
        alert("User not found. Please log in again.");
        return;
      }

      const response = await apiFetch(`/evouchers/${evoucherId}/post-to-ledger`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          user_name: user.name,
          user_role: user.department
        })
      });

      const result = await response.json();

      if (result.success) {
        alert("E-Voucher posted to ledger successfully! Check the relevant module (Expenses/Collections/Billings) to see the entry.");
        onStatusChange?.();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Error posting E-Voucher to ledger:", error);
      alert("Failed to post E-Voucher to ledger");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert("Please provide a reason for rejection.");
      return;
    }

    setIsSubmitting(true);
    try {
      const userData = localStorage.getItem("neuron_user");
      const user = userData ? JSON.parse(userData) : null;

      if (!user) {
        alert("User not found. Please log in again.");
        return;
      }

      const response = await apiFetch(`/evouchers/${evoucherId}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          user_name: user.name,
          user_role: user.department,
          rejection_reason: rejectionReason
        })
      });

      const result = await response.json();

      if (result.success) {
        alert("E-Voucher rejected successfully.");
        setShowRejectModal(false);
        setRejectionReason("");
        onStatusChange?.();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Error rejecting E-Voucher:", error);
      alert("Failed to reject E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this E-Voucher?")) {
      return;
    }

    setIsSubmitting(true);
    try {
      const userData = localStorage.getItem("neuron_user");
      const user = userData ? JSON.parse(userData) : null;

      if (!user) {
        alert("User not found. Please log in again.");
        return;
      }

      const response = await apiFetch(`/evouchers/${evoucherId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          user_name: user.name,
          user_role: user.department
        })
      });

      const result = await response.json();

      if (result.success) {
        alert("E-Voucher cancelled successfully.");
        onStatusChange?.();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Error cancelling E-Voucher:", error);
      alert("Failed to cancel E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {canSubmit && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#0F766E",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: isSubmitting ? 0.6 : 1
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#0D6560";
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#0F766E";
            }}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {isSubmitting ? "Submitting..." : "Submit for Approval"}
          </button>
        )}

        {canApprove && (
          <button
            onClick={handleApprove}
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#059669",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: isSubmitting ? 0.6 : 1
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#047857";
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#059669";
            }}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {isSubmitting ? "Approving..." : "Approve"}
          </button>
        )}

        {canPostToLedger && (
          <button
            onClick={handlePostToLedger}
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#059669",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: isSubmitting ? 0.6 : 1
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#047857";
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#059669";
            }}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {isSubmitting ? "Posting..." : "Post to Ledger"}
          </button>
        )}

        {canReject && (
          <button
            onClick={() => setShowRejectModal(true)}
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #EF4444",
              backgroundColor: "#FFFFFF",
              color: "#EF4444",
              fontSize: "14px",
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: isSubmitting ? 0.6 : 1
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#FEE2E2";
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#FFFFFF";
            }}
          >
            <XCircle size={16} />
            Reject
          </button>
        )}

        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #9CA3AF",
              backgroundColor: "#FFFFFF",
              color: "#6B7280",
              fontSize: "14px",
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: isSubmitting ? 0.6 : 1
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#F3F4F6";
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#FFFFFF";
            }}
          >
            <Ban size={16} />
            Cancel E-Voucher
          </button>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px"
          }}
          onClick={() => setShowRejectModal(false)}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "480px",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>
              Reject E-Voucher
            </h3>
            <p style={{ fontSize: "14px", color: "#667085", marginBottom: "16px" }}>
              Please provide a reason for rejecting this E-Voucher. The requestor will be able to see this reason.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #D1D5DB",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical",
                marginBottom: "16px"
              }}
            />
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #D1D5DB",
                  backgroundColor: "#FFFFFF",
                  color: "#374151",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: isSubmitting ? "not-allowed" : "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isSubmitting || !rejectionReason.trim()}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#EF4444",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: isSubmitting || !rejectionReason.trim() ? "not-allowed" : "pointer",
                  opacity: isSubmitting || !rejectionReason.trim() ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px"
                }}
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                {isSubmitting ? "Rejecting..." : "Reject E-Voucher"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}