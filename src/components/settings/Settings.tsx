import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: "12px" }}>
        {title}
      </h2>
      <div style={{ height: "1px", backgroundColor: "var(--neuron-ui-border)" }} />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: "4px" }}>
        {label}
      </p>
      <p style={{ fontSize: "13px", fontWeight: 400, color: "var(--neuron-ink-muted)" }}>
        {value || "—"}
      </p>
    </div>
  );
}

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: "6px" }}>
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
  height: "40px",
  border: "1px solid var(--neuron-ui-border)",
  borderRadius: "8px",
  padding: "0 12px",
  fontSize: "13px",
  color: "var(--neuron-ink-primary)",
  backgroundColor: "var(--neuron-bg-elevated)",
  outline: "none",
  boxSizing: "border-box",
};

const inputFocusStyle: React.CSSProperties = {
  border: "1px solid var(--neuron-ui-active-border)",
  boxShadow: "var(--neuron-state-focus-ring)",
};

const inputErrorStyle: React.CSSProperties = {
  border: "1px solid var(--neuron-semantic-danger)",
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
          ...(focused ? inputFocusStyle : {}),
          ...(error ? inputErrorStyle : {}),
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

function SaveButton({ saving, label, onClick }: { saving: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        height: "40px",
        padding: "0 20px",
        borderRadius: "8px",
        background: saving ? "var(--neuron-action-primary-hover)" : "var(--neuron-action-primary)",
        border: "none",
        color: "var(--neuron-action-primary-text)",
        fontSize: "13px",
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: saving ? "not-allowed" : "pointer",
        marginLeft: "auto",
        opacity: saving ? 0.8 : 1,
      }}
    >
      {saving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
      {saving ? "Saving…" : label}
    </button>
  );
}

export function Settings() {
  const { user, session, setUser } = useUser();

  // Profile section
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [nameError, setNameError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar_url || null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Team name for Account section
  const [teamName, setTeamName] = useState<string | null>(null);

  // Password section
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({ new: "", confirm: "" });
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user?.team_id) {
      supabase
        .from("teams")
        .select("name")
        .eq("id", user.team_id)
        .single()
        .then(({ data }) => setTeamName(data?.name || null));
    }
  }, [user?.team_id]);

  const authUid = session?.user?.id;

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveProfile = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Name is required");
      return;
    }
    setNameError("");
    setSavingProfile(true);

    try {
      let newAvatarUrl = avatarUrl;

      // Upload avatar if a new file was selected
      if (avatarFile && authUid) {
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const path = `${authUid}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });

        if (uploadError) throw new Error(`Avatar upload failed: ${uploadError.message}`);

        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        newAvatarUrl = urlData.publicUrl;
      }

      const { error } = await supabase
        .from("users")
        .update({ name: trimmedName, phone: phone.trim() || null, avatar_url: newAvatarUrl })
        .eq("id", user!.id);

      if (error) throw new Error(error.message);

      setAvatarUrl(newAvatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      setUser({ ...user!, name: trimmedName, phone: phone.trim() || null, avatar_url: newAvatarUrl });
      toast.success("Profile updated");
    } catch (err) {
      toast.error("Failed to update — try again");
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  };

  const validateNewPassword = () => {
    if (newPassword && newPassword.length < 8) {
      setPasswordErrors((prev) => ({ ...prev, new: "Password must be at least 8 characters" }));
    } else {
      setPasswordErrors((prev) => ({ ...prev, new: "" }));
    }
  };

  const validateConfirmPassword = () => {
    if (confirmPassword && confirmPassword !== newPassword) {
      setPasswordErrors((prev) => ({ ...prev, confirm: "Passwords do not match" }));
    } else {
      setPasswordErrors((prev) => ({ ...prev, confirm: "" }));
    }
  };

  const handleUpdatePassword = async () => {
    validateNewPassword();
    validateConfirmPassword();

    if (!newPassword) {
      setPasswordErrors((prev) => ({ ...prev, new: "New password is required" }));
      return;
    }
    if (newPassword.length < 8) return;
    if (newPassword !== confirmPassword) {
      setPasswordErrors((prev) => ({ ...prev, confirm: "Passwords do not match" }));
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  };

  const displayAvatar = avatarPreview || avatarUrl;
  const initials = (user?.name || user?.email || "U").charAt(0).toUpperCase();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--neuron-bg-elevated)" }}>
      {/* Page Header */}
      <div style={{ padding: "32px 48px", borderBottom: "1px solid var(--neuron-ui-border)" }}>
        <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--neuron-ink-primary)", letterSpacing: "-1.2px", marginBottom: "4px" }}>
          Settings
        </h1>
        <p style={{ fontSize: "14px", color: "var(--neuron-ink-muted)" }}>Manage your account details</p>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "40px 48px" }}>
        <div style={{ maxWidth: "600px" }}>

          {/* Section 1 — Profile */}
          <SectionHeader title="Profile" />

          {/* Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: displayAvatar ? "transparent" : "var(--neuron-brand-green-100)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {displayAvatar ? (
                <img src={displayAvatar} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: "22px", fontWeight: 600, color: "var(--neuron-action-primary)" }}>{initials}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarSelect}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: "14px", color: "var(--neuron-action-primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
              >
                Upload photo
              </button>
              {displayAvatar && (
                <button
                  onClick={handleRemoveAvatar}
                  style={{ fontSize: "14px", color: "var(--neuron-ink-muted)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Name */}
          <div style={{ marginBottom: "20px" }}>
            <FieldLabel required>Full name</FieldLabel>
            <TextInput
              value={name}
              onChange={setName}
              onBlur={() => { if (!name.trim()) setNameError("Name is required"); else setNameError(""); }}
              error={nameError}
            />
            <FieldError message={nameError} />
          </div>

          {/* Phone */}
          <div style={{ marginBottom: "24px" }}>
            <FieldLabel>Contact number</FieldLabel>
            <TextInput value={phone} onChange={setPhone} placeholder="e.g. +63 917 123 4567" />
            <p style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", marginTop: "4px" }}>e.g. +63 917 123 4567</p>
          </div>

          <SaveButton saving={savingProfile} label="Save Profile" onClick={handleSaveProfile} />

          {/* Section 2 — Account (read-only) */}
          <div style={{ marginTop: "40px" }}>
            <SectionHeader title="Account" />
            <ReadOnlyField label="Email address" value={user?.email || ""} />
            <ReadOnlyField label="Department" value={user?.department || ""} />
            <ReadOnlyField label="Role" value={
              user?.role === "team_leader" ? "Team Leader" :
              user?.role === "manager" ? "Manager" :
              user?.role === "staff" ? "Staff" : user?.role || ""
            } />
            <ReadOnlyField label="Team" value={teamName || "—"} />

            <div
              style={{
                backgroundColor: "var(--neuron-semantic-info-bg)",
                border: "1px solid var(--neuron-semantic-info-border)",
                borderRadius: "8px",
                padding: "12px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                marginTop: "4px",
              }}
            >
              <Info size={16} style={{ color: "var(--neuron-semantic-info)", flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: "13px", color: "var(--neuron-semantic-info)" }}>
                Contact an Executive admin to update these details.
              </p>
            </div>
          </div>

          {/* Section 3 — Password */}
          <div style={{ marginTop: "40px" }}>
            <SectionHeader title="Password" />

            <div style={{ marginBottom: "20px" }}>
              <FieldLabel required>New password</FieldLabel>
              <TextInput
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={setNewPassword}
                onBlur={validateNewPassword}
                error={passwordErrors.new}
                rightElement={
                  <button
                    onClick={() => setShowNew((v) => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", display: "flex" }}
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
              <FieldError message={passwordErrors.new} />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <FieldLabel required>Confirm password</FieldLabel>
              <TextInput
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={setConfirmPassword}
                onBlur={validateConfirmPassword}
                error={passwordErrors.confirm}
                rightElement={
                  <button
                    onClick={() => setShowConfirm((v) => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", display: "flex" }}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
              <FieldError message={passwordErrors.confirm} />
            </div>

            <SaveButton saving={savingPassword} label="Update Password" onClick={handleUpdatePassword} />
          </div>

        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
