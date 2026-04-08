import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, LogOut, Minus, Monitor, Moon, Pencil, Plus, Sun, X } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { getThemeModePreference, setThemeModePreference } from "../../theme/themeMode";
import { ThemeModePreference } from "../../theme/workspaceTheme";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)", marginBottom: "6px" }}>
      {children}{required && <span style={{ color: "var(--neuron-semantic-danger)" }}> *</span>}
    </label>
  );
}

function FieldError({ message }: { message: string }) {
  return message ? (
    <p style={{ fontSize: "12px", color: "var(--neuron-semantic-danger)", marginTop: "4px" }}>{message}</p>
  ) : null;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "36px",
  border: "1px solid var(--theme-border-default)",
  borderRadius: "8px",
  padding: "0 12px",
  fontSize: "13px",
  color: "var(--theme-text-primary)",
  backgroundColor: "var(--theme-bg-surface)",
  outline: "none",
  boxSizing: "border-box",
};

const quietButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  height: "32px",
  padding: "0 12px",
  borderRadius: "8px",
  border: "1px solid var(--theme-border-default)",
  backgroundColor: "transparent",
  color: "var(--theme-text-secondary)",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
};

const primaryButtonStyle: React.CSSProperties = {
  ...quietButtonStyle,
  border: "1px solid var(--theme-action-primary-border)",
  backgroundColor: "var(--theme-action-primary-bg)",
  color: "var(--theme-action-primary-text)",
  fontWeight: 600,
};

function TextInput({
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  type = "text",
  rightElement,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  type?: string;
  rightElement?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        style={{
          ...inputStyle,
          ...(focused ? { border: "1px solid var(--neuron-ui-active-border)", boxShadow: "var(--neuron-state-focus-ring)" } : {}),
          ...(error ? { border: "1px solid var(--neuron-semantic-danger)" } : {}),
          paddingRight: rightElement ? "44px" : "12px",
        }}
      />
      {rightElement && (
        <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>
          {rightElement}
        </div>
      )}
    </div>
  );
}

// Section: label sits above the card, children live inside the card
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p style={{
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--theme-text-primary)",
        marginBottom: "8px",
      }}>
        {title}
      </p>
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "12px",
        padding: "0 20px",
      }}>
        {children}
      </div>
    </div>
  );
}

// A single settings row: label + description on left, control on right
function SettingsRow({
  label,
  description,
  children,
  first = false,
  align = "center",
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  first?: boolean;
  align?: "center" | "flex-start";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: align,
        justifyContent: "space-between",
        gap: "12px 24px",
        padding: "14px 0",
        borderTop: first ? "none" : "1px solid var(--theme-border-subtle)",
      }}
    >
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)", marginBottom: description ? "2px" : 0 }}>{label}</p>
        {description && (
          <p style={{ margin: 0, fontSize: "12px", lineHeight: "16px", color: "var(--theme-text-muted)" }}>{description}</p>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: "0 1 auto", minWidth: "fit-content" }}>
        {children}
      </div>
    </div>
  );
}

// Read-only value display
function ReadOnlyValue({ value }: { value: string }) {
  return (
    <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)", fontWeight: 400 }}>
      {value}
    </span>
  );
}

// Theme dropdown
function ThemeDropdown({
  value,
  onChange,
}: {
  value: ThemeModePreference;
  onChange: (v: ThemeModePreference) => void;
}) {
  const options: { value: ThemeModePreference; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];

  const iconMap: Record<ThemeModePreference, React.ReactNode> = {
    light: <Sun size={14} />,
    dark: <Moon size={14} />,
    system: <Monitor size={14} />,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ color: "var(--theme-text-muted)", display: "flex", alignItems: "center" }}>
        {iconMap[value]}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ThemeModePreference)}
        style={{
          height: "32px",
          padding: "0 28px 0 10px",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "8px",
          backgroundColor: "var(--theme-bg-surface)",
          color: "var(--theme-text-primary)",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
          outline: "none",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 8px center",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar Crop Modal
// ---------------------------------------------------------------------------

function AvatarCropModal({
  src,
  onConfirm,
  onCancel,
}: {
  src: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const SIZE = 300;
  const RADIUS = SIZE / 2;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(0.1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const dragOrigin = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  // Load image and auto-fit to cover the circle
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const cover = Math.max(SIZE / img.width, SIZE / img.height);
      setMinScale(cover * 0.5);
      setScale(cover);
      setOffset({
        x: (SIZE - img.width * cover) / 2,
        y: (SIZE - img.height * cover) / 2,
      });
      setImgEl(img);
    };
    img.src = src;
  }, [src]);

  // Redraw canvas whenever image, scale, or offset changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgEl) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(imgEl, offset.x, offset.y, imgEl.width * scale, imgEl.height * scale);

    // Dim area outside the crop circle using brand ink color
    ctx.save();
    ctx.fillStyle = "rgba(18, 51, 43, 0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, SIZE);
    ctx.arc(RADIUS, RADIUS, RADIUS - 1, 0, Math.PI * 2, true); // counterclockwise = cutout
    ctx.fill("evenodd");
    ctx.restore();

    // Circle border — crisp white ring
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(RADIUS, RADIUS, RADIUS - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }, [imgEl, scale, offset]);

  // Wheel zoom — must be non-passive to call preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.93;
      setScale(s => Math.max(minScale, Math.min(8, s * factor)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [minScale]);

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragging.current = true;
    setIsDragging(true);
    dragOrigin.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setOffset({
      x: dragOrigin.current.ox + (e.clientX - dragOrigin.current.mx),
      y: dragOrigin.current.oy + (e.clientY - dragOrigin.current.my),
    });
  };

  const stopDrag = () => {
    dragging.current = false;
    setIsDragging(false);
  };

  const handleApply = () => {
    if (!imgEl) return;
    const off = document.createElement("canvas");
    off.width = SIZE;
    off.height = SIZE;
    const ctx = off.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(RADIUS, RADIUS, RADIUS, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(imgEl, offset.x, offset.y, imgEl.width * scale, imgEl.height * scale);
    off.toBlob(blob => { if (blob) onConfirm(blob); }, "image/png");
  };

  // Normalized zoom percentage for the readout (0–100)
  const zoomPct = Math.round(
    Math.min(100, Math.max(0, ((scale - minScale) / (8 - minScale)) * 100))
  );

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        // Brand ink scrim — softer than plain black, tonally consistent
        background: "rgba(18, 51, 43, 0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
    >
      <div
        style={{
          background: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: 16,
          width: 420,
          overflow: "hidden",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid var(--theme-border-default)",
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--theme-text-primary)", margin: 0 }}>
            Crop profile photo
          </p>
          <p style={{ fontSize: 12, color: "var(--theme-text-muted)", margin: "3px 0 0" }}>
            Drag to reposition · Scroll or use the slider to zoom
          </p>
        </div>

        {/* ── Canvas stage ── */}
        <div style={{
          background: "var(--theme-bg-surface-subtle)",
          borderBottom: "1px solid var(--theme-border-default)",
          padding: "28px 0",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}>
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            onMouseDown={onMouseDown}
            onMouseLeave={stopDrag}
            style={{
              borderRadius: "50%",
              cursor: isDragging ? "grabbing" : "grab",
              display: "block",
              userSelect: "none",
              // Outer ring so the circle sits clearly against the stage bg
              outline: "1px solid var(--theme-border-default)",
              outlineOffset: "2px",
            }}
          />
        </div>

        {/* ── Controls ── */}
        <div style={{ padding: "16px 24px 20px" }}>
          {/* Zoom row: − slider + pct */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <button
              onMouseDown={e => { e.preventDefault(); setScale(s => Math.max(minScale, s * 0.9)); }}
              style={{
                width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                border: "1px solid var(--theme-border-default)",
                background: "transparent", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--theme-text-secondary)",
              }}
              title="Zoom out"
            >
              <Minus size={13} />
            </button>
            <input
              type="range"
              min={Math.round(minScale * 100)}
              max={800}
              value={Math.round(scale * 100)}
              onChange={e => setScale(Number(e.target.value) / 100)}
              style={{ flex: 1, accentColor: "var(--neuron-ui-active-border)" }}
            />
            <button
              onMouseDown={e => { e.preventDefault(); setScale(s => Math.min(8, s * 1.1)); }}
              style={{
                width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                border: "1px solid var(--theme-border-default)",
                background: "transparent", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--theme-text-secondary)",
              }}
              title="Zoom in"
            >
              <Plus size={13} />
            </button>
            <span style={{
              fontSize: 12, fontWeight: 500, color: "var(--theme-text-secondary)",
              width: 34, textAlign: "right", flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
            }}>
              {zoomPct}%
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onCancel} style={quietButtonStyle}>Cancel</button>
            <button
              onClick={handleApply}
              disabled={!imgEl}
              style={{ ...primaryButtonStyle, opacity: !imgEl ? 0.6 : 1 }}
            >
              Apply crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function Settings() {
  const { user, session, setUser, logout } = useUser();

  // Profile edit state
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [nameError, setNameError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar_url || null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Team name

  // Password
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({ new: "", confirm: "" });
  const [savingPassword, setSavingPassword] = useState(false);

  // Appearance
  const [themeModePreference, setThemeModePreferenceState] = useState<ThemeModePreference>(() => getThemeModePreference());

  // Logout
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const { data: teamName = null } = useQuery({
    queryKey: ["teams", user?.team_id ?? ""],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("name").eq("id", user!.team_id!).single();
      return data?.name || null;
    },
    enabled: !!user?.team_id,
    staleTime: 5 * 60 * 1000,
  });

  const authUid = session?.user?.id;
  const displayAvatar = avatarPreview || avatarUrl;
  const initials = (user?.name || user?.email || "U").charAt(0).toUpperCase();

  const roleLabel =
    user?.role === "team_leader" ? "Team Leader" :
    user?.role === "manager" ? "Manager" :
    user?.role === "staff" ? "Staff" : user?.role || "";

  // ── Avatar ──────────────────────────────────────────────────────────────

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Read as data URL so the crop modal can display it
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    // Reset so re-selecting the same file fires onChange again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropConfirm = (blob: Blob) => {
    const file = new File([blob], "avatar.png", { type: "image/png" });
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(blob));
    setCropSrc(null);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Profile save ────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setNameError("Name is required"); return; }
    setNameError("");
    setSavingProfile(true);

    try {
      let newAvatarUrl = avatarUrl;

      // Avatar upload — has its own try-catch so any failure (including a
      // 15s timeout on a hung request) is non-fatal: name/phone still save.
      if (avatarFile && authUid) {
        const ext = avatarFile.name.split(".").pop() || "png";
        const path = `${authUid}/avatar.${ext}`;
        try {
          const { error: uploadError } = await Promise.race([
            supabase.storage
              .from("avatars")
              .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Upload timed out")), 15_000)
            ),
          ]);
          if (uploadError) {
            toast.warning("Photo couldn't be saved — profile updated without it");
            console.error("Avatar upload error:", uploadError);
          } else {
            const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
            newAvatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;
          }
        } catch (uploadErr) {
          // Timeout or network hang — non-fatal, continue saving name/phone
          toast.warning("Photo upload timed out — saving profile without it");
          console.error("Avatar upload failed:", uploadErr);
        }
      }

      // Remove old avatar from storage when user explicitly cleared it
      if (!avatarFile && avatarUrl === null && user?.avatar_url && authUid) {
        const { data: files } = await supabase.storage.from("avatars").list(authUid);
        if (files && files.length > 0) {
          await supabase.storage.from("avatars").remove(files.map((f) => `${authUid}/${f.name}`));
        }
      }

      const { error } = await supabase
        .from("users")
        .update({ name: trimmedName, phone: phone.trim() || null, avatar_url: newAvatarUrl })
        .eq("id", user!.id);
      if (error) throw new Error(error.message);

      setAvatarUrl(newAvatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      const updated = { ...user!, name: trimmedName, phone: phone.trim() || null, avatar_url: newAvatarUrl };
      setUser(updated);
      localStorage.setItem("neuron_user", JSON.stringify(updated));
      toast.success("Profile updated");
      setEditing(false);
    } catch (err) {
      toast.error("Failed to update — try again");
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelEdit = () => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
    setAvatarUrl(user?.avatar_url || null);
    setAvatarPreview(null);
    setAvatarFile(null);
    setNameError("");
    setEditing(false);
  };

  // ── Password ─────────────────────────────────────────────────────────────

  const validateNewPassword = () => {
    if (newPassword && newPassword.length < 8)
      setPasswordErrors((p) => ({ ...p, new: "Password must be at least 8 characters" }));
    else setPasswordErrors((p) => ({ ...p, new: "" }));
  };

  const validateConfirmPassword = () => {
    if (confirmPassword && confirmPassword !== newPassword)
      setPasswordErrors((p) => ({ ...p, confirm: "Passwords do not match" }));
    else setPasswordErrors((p) => ({ ...p, confirm: "" }));
  };

  const handleUpdatePassword = async () => {
    validateNewPassword();
    validateConfirmPassword();
    if (!newPassword) { setPasswordErrors((p) => ({ ...p, new: "New password is required" })); return; }
    if (newPassword.length < 8) return;
    if (newPassword !== confirmPassword) { setPasswordErrors((p) => ({ ...p, confirm: "Passwords do not match" })); return; }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Theme ────────────────────────────────────────────────────────────────

  const handleThemeModeChange = (preference: ThemeModePreference) => {
    setThemeModePreference(preference);
    setThemeModePreferenceState(preference);
  };

  // ── Logout ───────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    setLoggingOut(true);
    logout();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--theme-bg-surface)" }}>

      {/* Page header */}
      <div style={{ padding: "32px 48px 0" }}>
        <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px", letterSpacing: "-1.2px" }}>
          Settings
        </h1>
        <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
          Manage your account and preferences
        </p>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", backgroundColor: "var(--theme-bg-surface)" }}>
        {/* Scroll fade top */}
        <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none" style={{ height: "40px", background: "linear-gradient(to bottom, var(--theme-bg-surface), transparent)" }} />
        {/* Scroll fade bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none" style={{ height: "40px", background: "linear-gradient(to top, var(--theme-bg-surface), transparent)" }} />
        <div className="scrollbar-hide" style={{ height: "100%", overflowY: "auto", padding: "24px 48px 48px" }}>
        <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* ── Profile ──────────────────────────────────────────────────── */}
          <Section title="Profile">
            {editing ? (
              <div style={{ padding: "16px 0" }}>
                {/* Avatar upload */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                  <div style={{
                    width: "56px", height: "56px", borderRadius: "50%", flexShrink: 0,
                    backgroundColor: displayAvatar ? "transparent" : "var(--neuron-brand-green-100)",
                    border: "1px solid var(--theme-border-default)",
                    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                  }}>
                    {displayAvatar
                      ? <img src={displayAvatar} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: "20px", fontWeight: 600, color: "var(--neuron-action-primary)" }}>{initials}</span>
                    }
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarSelect} style={{ display: "none" }} />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--neuron-action-primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
                    >
                      Upload photo
                    </button>
                    {displayAvatar && (
                      <button
                        onClick={handleRemoveAvatar}
                        style={{ fontSize: "13px", color: "var(--theme-text-muted)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <FieldLabel required>Full name</FieldLabel>
                  <TextInput
                    value={name}
                    onChange={setName}
                    onBlur={() => { if (!name.trim()) setNameError("Name is required"); else setNameError(""); }}
                    error={nameError}
                  />
                  <FieldError message={nameError} />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <FieldLabel>Contact number</FieldLabel>
                  <TextInput value={phone} onChange={setPhone} placeholder="+63 917 123 4567" />
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button onClick={handleCancelEdit} style={quietButtonStyle}>Cancel</button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    style={{ ...primaryButtonStyle, height: "32px", padding: "0 14px", opacity: savingProfile ? 0.8 : 1, cursor: savingProfile ? "not-allowed" : "pointer" }}
                  >
                    {savingProfile && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
                    {savingProfile ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "16px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{
                    width: "44px", height: "44px", borderRadius: "50%", flexShrink: 0,
                    backgroundColor: displayAvatar ? "transparent" : "var(--neuron-brand-green-100)",
                    border: "1px solid var(--theme-border-default)",
                    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                  }}>
                    {displayAvatar
                      ? <img src={displayAvatar} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--neuron-action-primary)" }}>{initials}</span>
                    }
                  </div>
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "1px" }}>
                      {user?.name || "—"}
                    </p>
                    <p style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                      {user?.department}{roleLabel ? ` · ${roleLabel}` : ""}
                      {user?.phone ? ` · ${user.phone}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditing(true)}
                  style={quietButtonStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-state-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <Pencil size={13} />
                  Edit
                </button>
              </div>
            )}
          </Section>

          {/* ── Account ──────────────────────────────────────────────────── */}
          <Section title="Account">
            {[
              { label: "Email", value: user?.email || "—" },
              { label: "Department", value: user?.department || "—" },
              { label: "Role", value: roleLabel || "—" },
              { label: "Team", value: teamName || "—" },
            ].map(({ label, value }, index) => (
              <SettingsRow key={label} first={index === 0} label={label}>
                <ReadOnlyValue value={value} />
              </SettingsRow>
            ))}
          </Section>

          {/* ── Security ─────────────────────────────────────────────────── */}
          <Section title="Security">
            <SettingsRow
              first
              label="Password"
              description={showPasswordForm ? undefined : "Update your account password."}
              align={showPasswordForm ? "flex-start" : "center"}
            >
              {!showPasswordForm ? (
                <button
                  onClick={() => setShowPasswordForm(true)}
                  style={quietButtonStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-state-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  Change
                </button>
              ) : (
                <button
                  onClick={() => { setShowPasswordForm(false); setNewPassword(""); setConfirmPassword(""); setPasswordErrors({ new: "", confirm: "" }); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", display: "flex", padding: "4px" }}
                >
                  <X size={16} />
                </button>
              )}
            </SettingsRow>

            {showPasswordForm && (
              <div style={{ paddingBottom: "16px" }}>
                <div style={{ marginBottom: "14px" }}>
                  <FieldLabel required>New password</FieldLabel>
                  <TextInput
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={setNewPassword}
                    onBlur={validateNewPassword}
                    error={passwordErrors.new}
                    rightElement={
                      <button onClick={() => setShowNew((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", display: "flex", padding: 0 }}>
                        {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    }
                  />
                  <FieldError message={passwordErrors.new} />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <FieldLabel required>Confirm password</FieldLabel>
                  <TextInput
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    onBlur={validateConfirmPassword}
                    error={passwordErrors.confirm}
                    rightElement={
                      <button onClick={() => setShowConfirm((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", display: "flex", padding: 0 }}>
                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    }
                  />
                  <FieldError message={passwordErrors.confirm} />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={handleUpdatePassword}
                    disabled={savingPassword}
                    style={{ ...primaryButtonStyle, height: "32px", padding: "0 14px", cursor: savingPassword ? "not-allowed" : "pointer", opacity: savingPassword ? 0.8 : 1 }}
                  >
                    {savingPassword && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
                    {savingPassword ? "Updating…" : "Update password"}
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* ── Appearance ───────────────────────────────────────────────── */}
          <Section title="Appearance">
            <SettingsRow
              first
              label="Theme"
              description="Choose how Neuron looks on this device."
            >
              <ThemeDropdown
                value={themeModePreference}
                onChange={(pref) => handleThemeModeChange(pref)}
              />
            </SettingsRow>
          </Section>

          {/* ── Sign out ─────────────────────────────────────────────────── */}
          <div>
            <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "8px" }}>
              Danger zone
            </p>
            <div style={{
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
            }}>
              <div>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)", marginBottom: "2px" }}>Sign out</p>
                <p style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                  You'll be signed out of Neuron on this device.
                </p>
              </div>
              {confirmingLogout ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Sign out?</span>
                  <button
                    onClick={() => setConfirmingLogout(false)}
                    style={{
                      height: "32px", padding: "0 12px", borderRadius: "8px",
                      border: "1px solid var(--theme-border-default)", backgroundColor: "transparent",
                      color: "var(--theme-text-primary)", fontSize: "13px", fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      height: "32px", padding: "0 12px", borderRadius: "8px",
                      border: "none", backgroundColor: "var(--neuron-semantic-danger)",
                      color: "#fff", fontSize: "13px", fontWeight: 500,
                      cursor: loggingOut ? "not-allowed" : "pointer",
                      opacity: loggingOut ? 0.7 : 1,
                    }}
                  >
                    {loggingOut
                      ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                      : <LogOut size={13} />
                    }
                    {loggingOut ? "Signing out…" : "Yes, sign out"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingLogout(true)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    height: "32px", padding: "0 12px", borderRadius: "8px",
                    border: "1px solid var(--neuron-semantic-danger)", backgroundColor: "transparent",
                    color: "var(--neuron-semantic-danger)", fontSize: "13px", fontWeight: 500,
                    cursor: "pointer", transition: "background-color 120ms ease", flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--neuron-semantic-danger) 8%, transparent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              )}
            </div>
          </div>

        </div>
        </div>
      </div>

      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}
