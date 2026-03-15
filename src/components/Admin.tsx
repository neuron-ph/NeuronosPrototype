import { useState } from "react";
import { cleanupDuplicates } from "../utils/cleanupDuplicates";
import { toast } from "sonner@2.0.3";
import { useNavigate } from "react-router";
import { apiFetch } from "../utils/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Plus, Edit, Trash2, RefreshCw, TestTube } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  department: "Business Development" | "Pricing" | "Operations" | "Accounting" | "Executive" | "HR";
  role: "rep" | "manager" | "director";
  status: "Active" | "Inactive";
  service_type?: "Forwarding" | "Brokerage" | "Trucking" | "Marine Insurance" | "Others" | null;
  operations_role?: "Manager" | "Supervisor" | "Handler" | null;
}

interface AdminProps {
  users?: User[];
  onAddUser?: (user: Omit<User, "id">) => void;
  onDeleteUser?: (id: string) => void;
}

export function Admin({ users = [], onAddUser, onDeleteUser }: AdminProps) {
  const navigate = useNavigate();
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", department: "Business Development" as User["department"], role: "rep" as User["role"], status: "Active" as const, service_type: null as User["service_type"], operations_role: null as User["operations_role"] });
  const [expenseTypes, setExpenseTypes] = useState(["Fuel", "Toll", "Maintenance", "Other"]);
  const [documentTypes, setDocumentTypes] = useState(["Booking Details", "Expense Entries", "Invoice", "Receipt"]);
  const [trackingFormat, setTrackingFormat] = useState("ND-{YYYY}-{####}");
  const [newExpenseType, setNewExpenseType] = useState("");
  const [newDocumentType, setNewDocumentType] = useState("");
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [showTestingTools, setShowTestingTools] = useState(false);
  const [isMigratingStatuses, setIsMigratingStatuses] = useState(false);
  const [isMigratingServices, setIsMigratingServices] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isClearingSeed, setIsClearingSeed] = useState(false);
  const [isMigratingContactNames, setIsMigratingContactNames] = useState(false);
  const [isSeedingUsers, setIsSeedingUsers] = useState(false);
  const [isSeedingBalanceSheet, setIsSeedingBalanceSheet] = useState(false);
  const [isSeedingIncomeStatement, setIsSeedingIncomeStatement] = useState(false);

  // Mock users data
  const mockUsers: User[] = [
    { id: "1", name: "Maria Santos", email: "maria.santos@jjbos.ph", department: "Executive", role: "director", status: "Active" },
    { id: "2", name: "Juan Dela Cruz", email: "juan.delacruz@jjbos.ph", department: "Business Development", role: "rep", status: "Active" },
    { id: "3", name: "Pedro Reyes", email: "pedro.reyes@jjbos.ph", department: "Operations", role: "rep", status: "Active", service_type: "Forwarding", operations_role: "Handler" },
    { id: "4", name: "Anna Garcia", email: "anna.garcia@jjbos.ph", department: "Accounting", role: "manager", status: "Inactive" },
  ];

  const displayUsers = users.length > 0 ? users : mockUsers;

  const handleAddUser = () => {
    onAddUser?.(newUser);
    setNewUser({ name: "", email: "", department: "Business Development" as User["department"], role: "rep" as User["role"], status: "Active" as const, service_type: null as User["service_type"], operations_role: null as User["operations_role"] });
    setIsUserDialogOpen(false);
  };

  const handleAddExpenseType = () => {
    if (newExpenseType && !expenseTypes.includes(newExpenseType)) {
      setExpenseTypes([...expenseTypes, newExpenseType]);
      setNewExpenseType("");
    }
  };

  const handleAddDocumentType = () => {
    if (newDocumentType && !documentTypes.includes(newDocumentType)) {
      setDocumentTypes([...documentTypes, newDocumentType]);
      setNewDocumentType("");
    }
  };

  const handleDeleteExpenseType = (type: string) => {
    setExpenseTypes(expenseTypes.filter((t) => t !== type));
  };

  const handleDeleteDocumentType = (type: string) => {
    setDocumentTypes(documentTypes.filter((t) => t !== type));
  };

  const handleCleanupDuplicates = async () => {
    setIsCleaningUp(true);
    const result = await cleanupDuplicates();
    if (result.success) {
      toast.success("Duplicates cleaned up successfully!");
    } else {
      toast.error("Failed to clean up duplicates.");
    }
    setIsCleaningUp(false);
  };

  const handleMigrateQuotationStatuses = async () => {
    setIsMigratingStatuses(true);
    try {
      const response = await apiFetch(`/quotations/migrate-statuses`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Migration complete! ${result.migrated} quotations updated, ${result.skipped} already current.`);
      } else {
        toast.error(`Migration failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error migrating quotation statuses:", error);
      toast.error("Failed to migrate quotation statuses. Check console for details.");
    } finally {
      setIsMigratingStatuses(false);
    }
  };

  const handleMigrateServicesMetadata = async () => {
    setIsMigratingServices(true);
    try {
      const response = await apiFetch(`/migrate-services-metadata`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        const { projects, quotations } = result.data;
        toast.success(
          `✅ Migration complete! Projects: ${projects.updated} updated, ${projects.skipped} skipped. Quotations: ${quotations.updated} updated, ${quotations.skipped} skipped.`,
          { duration: 5000 }
        );
      } else {
        toast.error(`Migration failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error migrating services metadata:", error);
      toast.error("Failed to migrate services metadata. Check console for details.");
    } finally {
      setIsMigratingServices(false);
    }
  };

  const handleSeedComprehensiveData = async () => {
    setIsSeeding(true);
    try {
      // First, seed customers and contacts with correct IDs
      console.log('[SEED] Seeding customers...');
      await apiFetch(`/customers/seed`, { method: 'POST' });
      
      console.log('[SEED] Seeding contacts...');
      await apiFetch(`/contacts/seed`, { method: 'POST' });
      
      // Then seed comprehensive data (quotations, projects, etc.)
      console.log('[SEED] Seeding comprehensive data...');
      const response = await apiFetch(`/seed/comprehensive`, { method: 'POST' });

      const result = await response.json();

      if (result.success) {
        toast.success(`🎉 Seed complete! ${result.summary.customers} customers, ${result.summary.quotations} quotations created!`);
      } else {
        toast.error(`Seed failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error seeding comprehensive data:", error);
      toast.error("Failed to seed data. Check console for details.");
    } finally {
      setIsSeeding(false);
    }
  };

  const handleClearSeedData = async () => {
    setIsClearingSeed(true);
    try {
      // Clear contacts first
      console.log('[CLEAR] Clearing contacts...');
      const contactsResponse = await apiFetch(`/contacts/clear`, { method: 'DELETE' });
      const contactsResult = await contactsResponse.json();
      console.log('[CLEAR] Contacts cleared:', contactsResult);
      
      // Clear customers
      console.log('[CLEAR] Clearing customers...');
      const customersResponse = await apiFetch(`/customers/clear`, { method: 'DELETE' });
      const customersResult = await customersResponse.json();
      console.log('[CLEAR] Customers cleared:', customersResult);
      
      // Clear quotations and projects
      console.log('[CLEAR] Clearing quotations and projects...');
      const response = await apiFetch(`/seed/clear`, { method: 'DELETE' });

      const result = await response.json();

      if (result.success) {
        toast.success(`✅ Cleared all data: ${contactsResult.count || 0} contacts, ${customersResult.count || 0} customers, quotations & projects!`);
      } else {
        toast.error(`Clear failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error clearing seed data:", error);
      toast.error("Failed to clear seed data. Check console for details.");
    } finally {
      setIsClearingSeed(false);
    }
  };

  const handleMigrateContactNames = async () => {
    setIsMigratingContactNames(true);
    try {
      const response = await apiFetch(`/contacts/migrate-names`, { method: 'POST' });

      const result = await response.json();

      if (result.success) {
        toast.success(`Migration complete! ${result.migrated} contacts migrated, ${result.skipped} already up-to-date.`);
      } else {
        toast.error(`Migration failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error migrating contact names:", error);
      toast.error("Failed to migrate contact names. Check console for details.");
    } finally {
      setIsMigratingContactNames(false);
    }
  };

  const handleSeedUsers = async () => {
    setIsSeedingUsers(true);
    try {
      const response = await apiFetch(`/users/seed`, { method: 'POST' });

      const result = await response.json();

      if (result.success) {
        toast.success(`🎉 Seed complete! ${result.summary.users} users created!`);
      } else {
        toast.error(`Seed failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error seeding users:", error);
      toast.error("Failed to seed users. Check console for details.");
    } finally {
      setIsSeedingUsers(false);
    }
  };

  const handleSeedBalanceSheet = async () => {
    setIsSeedingBalanceSheet(true);
    try {
      const response = await apiFetch(`/seed/coa-balance-sheet`, { method: 'POST' });

      const result = await response.json();

      if (result.success) {
        toast.success(`🎉 Balance Sheet COA Seeded Successfully!`);
      } else {
        toast.error(`Seed failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error seeding Balance Sheet:", error);
      toast.error("Failed to seed Balance Sheet. Check console for details.");
    } finally {
      setIsSeedingBalanceSheet(false);
    }
  };

  const handleSeedIncomeStatement = async () => {
    setIsSeedingIncomeStatement(true);
    try {
      const response = await apiFetch(`/seed/coa-income-statement`, { method: 'POST' });

      const result = await response.json();

      if (result.success) {
        toast.success(`🎉 Income Statement COA Seeded Successfully!`);
      } else {
        toast.error(`Seed failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error seeding Income Statement:", error);
      toast.error("Failed to seed Income Statement. Check console for details.");
    } finally {
      setIsSeedingIncomeStatement(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF" }}>
      {/* Main Content */}
      <div style={{ padding: "32px 48px", maxWidth: "100%", margin: "0 auto" }}>
        {/* Page Header Row - Title */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "#12332B", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              Settings
            </h1>
            <p style={{ fontSize: "14px", color: "#667085" }}>
              System administration and configuration
            </p>
          </div>
        </div>

        <Tabs defaultValue="users" className="w-full">
          {/* Tabs Navigation - Individual bordered buttons */}
          <TabsList style={{ background: "transparent", padding: 0, marginBottom: "24px", gap: "8px", height: "auto", display: "flex" }}>
            <TabsTrigger 
              value="users" 
              style={{ 
                borderRadius: "12px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                border: "1px solid #E5E9F0",
                background: "white",
                color: "#667085",
                transition: "all 150ms ease"
              }}
              className="data-[state=active]:bg-[#0F766E] data-[state=active]:text-white data-[state=active]:border-[#0F766E]"
            >
              Users
            </TabsTrigger>
            <TabsTrigger 
              value="settings"
              style={{ 
                borderRadius: "12px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                border: "1px solid #E5E9F0",
                background: "white",
                color: "#667085",
                transition: "all 150ms ease"
              }}
              className="data-[state=active]:bg-[#0F766E] data-[state=active]:text-white data-[state=active]:border-[#0F766E]"
            >
              Settings
            </TabsTrigger>
            <TabsTrigger 
              value="system"
              style={{ 
                borderRadius: "12px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                border: "1px solid #E5E9F0",
                background: "white",
                color: "#667085",
                transition: "all 150ms ease"
              }}
              className="data-[state=active]:bg-[#0F766E] data-[state=active]:text-white data-[state=active]:border-[#0F766E]"
            >
              System Info
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <div style={{ background: "white", border: "1px solid #E5E9F0", borderRadius: "16px", overflow: "hidden" }}>
              <div style={{ padding: "24px", borderBottom: "1px solid #E5E9F0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#12332B", marginBottom: "4px" }}>User Management</h3>
                    <p style={{ fontSize: "14px", color: "#667085" }}>Manage system users and their roles</p>
                  </div>
                  <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
                    <DialogTrigger asChild>
                      <button
                        style={{
                          height: "40px",
                          padding: "0 20px",
                          borderRadius: "12px",
                          background: "#0F766E",
                          border: "none",
                          color: "#FFFFFF",
                          fontSize: "14px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          transition: "all 150ms ease"
                        }}
                      >
                        <Plus className="w-4 h-4" />
                        Add User
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New User</DialogTitle>
                        <DialogDescription>Add a new user to the system with their role and permissions.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div>
                          <Label>Name</Label>
                          <Input
                            value={newUser.name}
                            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                            placeholder="Enter name"
                          />
                        </div>
                        <div>
                          <Label>Email</Label>
                          <Input
                            type="email"
                            value={newUser.email}
                            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                            placeholder="Enter email"
                          />
                        </div>
                        <div>
                          <Label>Department</Label>
                          <Select
                            value={newUser.department}
                            onValueChange={(value: "Business Development" | "Pricing" | "Operations" | "Accounting" | "Executive" | "HR") =>
                              setNewUser({ ...newUser, department: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Business Development">Business Development</SelectItem>
                              <SelectItem value="Pricing">Pricing</SelectItem>
                              <SelectItem value="Operations">Operations</SelectItem>
                              <SelectItem value="Accounting">Accounting</SelectItem>
                              <SelectItem value="Executive">Executive</SelectItem>
                              <SelectItem value="HR">HR</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Role</Label>
                          <Select
                            value={newUser.role}
                            onValueChange={(value: "rep" | "manager" | "director") =>
                              setNewUser({ ...newUser, role: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rep">Rep</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="director">Director</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Status</Label>
                          <Select
                            value={newUser.status}
                            onValueChange={(value: "Active" | "Inactive") =>
                              setNewUser({ ...newUser, status: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Active">Active</SelectItem>
                              <SelectItem value="Inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {newUser.department === "Operations" && (
                          <>
                            <div>
                              <Label>Service Type</Label>
                              <Select
                                value={newUser.service_type || ""}
                                onValueChange={(value: string) =>
                                  setNewUser({ ...newUser, service_type: value as User["service_type"] })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select service type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Forwarding">Forwarding</SelectItem>
                                  <SelectItem value="Brokerage">Brokerage</SelectItem>
                                  <SelectItem value="Trucking">Trucking</SelectItem>
                                  <SelectItem value="Marine Insurance">Marine Insurance</SelectItem>
                                  <SelectItem value="Others">Others</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Operations Role</Label>
                              <Select
                                value={newUser.operations_role || ""}
                                onValueChange={(value: string) =>
                                  setNewUser({ ...newUser, operations_role: value as User["operations_role"] })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select operations role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Manager">Manager</SelectItem>
                                  <SelectItem value="Supervisor">Supervisor</SelectItem>
                                  <SelectItem value="Handler">Handler</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        )}
                        <Button
                          onClick={handleAddUser}
                          className="w-full bg-[#0F766E] hover:bg-[#0D6560]"
                        >
                          Add User
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell style={{ color: "#12332B", fontWeight: 500 }}>{user.name}</TableCell>
                      <TableCell style={{ color: "#667085" }}>{user.email}</TableCell>
                      <TableCell>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 12px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 500,
                            backgroundColor: user.department === "Executive" ? "#F3E8FF" : "#DBEAFE",
                            color: user.department === "Executive" ? "#7E22CE" : "#1D4ED8"
                          }}
                        >
                          {user.department}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 12px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 500,
                            backgroundColor: user.role === "director" ? "#F3E8FF" : "#DBEAFE",
                            color: user.role === "director" ? "#7E22CE" : "#1D4ED8"
                          }}
                        >
                          {user.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 12px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 500,
                            backgroundColor: user.status === "Active" ? "#E8F5E9" : "#F3F4F6",
                            color: user.status === "Active" ? "#10b981" : "#6B7280"
                          }}
                        >
                          {user.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            style={{
                              padding: "6px",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              color: "#667085",
                              transition: "color 150ms ease"
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteUser?.(user.id)}
                            style={{
                              padding: "6px",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              color: "#EF4444",
                              transition: "color 150ms ease"
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Expense Types */}
              <div style={{ background: "white", border: "1px solid #E5E9F0", borderRadius: "16px", padding: "24px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>Expense Types</h3>
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                  <Input
                    value={newExpenseType}
                    onChange={(e) => setNewExpenseType(e.target.value)}
                    placeholder="Add new expense type"
                    onKeyPress={(e) => e.key === "Enter" && handleAddExpenseType()}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={handleAddExpenseType}
                    style={{
                      height: "40px",
                      width: "40px",
                      borderRadius: "12px",
                      background: "#0F766E",
                      border: "none",
                      color: "#FFFFFF",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 150ms ease"
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {expenseTypes.map((type) => (
                    <span
                      key={type}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 14px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 500,
                        backgroundColor: "#F3F4F6",
                        color: "#374151",
                        border: "1px solid #E5E7EB"
                      }}
                    >
                      {type}
                      <button
                        onClick={() => handleDeleteExpenseType(type)}
                        style={{
                          marginLeft: "8px",
                          background: "transparent",
                          border: "none",
                          color: "#EF4444",
                          cursor: "pointer",
                          fontSize: "18px",
                          lineHeight: "1",
                          padding: 0
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Document Types */}
              <div style={{ background: "white", border: "1px solid #E5E9F0", borderRadius: "16px", padding: "24px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>Document Types</h3>
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                  <Input
                    value={newDocumentType}
                    onChange={(e) => setNewDocumentType(e.target.value)}
                    placeholder="Add new document type"
                    onKeyPress={(e) => e.key === "Enter" && handleAddDocumentType()}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={handleAddDocumentType}
                    style={{
                      height: "40px",
                      width: "40px",
                      borderRadius: "12px",
                      background: "#0F766E",
                      border: "none",
                      color: "#FFFFFF",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 150ms ease"
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {documentTypes.map((type) => (
                    <span
                      key={type}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 14px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 500,
                        backgroundColor: "#F3F4F6",
                        color: "#374151",
                        border: "1px solid #E5E7EB"
                      }}
                    >
                      {type}
                      <button
                        onClick={() => handleDeleteDocumentType(type)}
                        style={{
                          marginLeft: "8px",
                          background: "transparent",
                          border: "none",
                          color: "#EF4444",
                          cursor: "pointer",
                          fontSize: "18px",
                          lineHeight: "1",
                          padding: 0
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Tracking Number Format */}
              <div style={{ background: "white", border: "1px solid #E5E9F0", borderRadius: "16px", padding: "24px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>Tracking Number Format</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <Label style={{ marginBottom: "6px", display: "block" }}>Format Pattern</Label>
                    <Input
                      value={trackingFormat}
                      onChange={(e) => setTrackingFormat(e.target.value)}
                      placeholder="e.g., ND-{YYYY}-{####}"
                    />
                    <p style={{ fontSize: "12px", color: "#667085", marginTop: "8px" }}>
                      Use {"{YYYY}"} for year, {"{####}"} for sequential number
                    </p>
                  </div>
                  <div style={{ padding: "12px", background: "#F9FAFB", borderRadius: "8px", border: "1px solid #E5E7EB" }}>
                    <p style={{ fontSize: "14px", color: "#667085" }}>Example: ND-2025-0001</p>
                  </div>
                </div>
              </div>

              {/* Chart of Accounts Configuration */}
              <div style={{ background: "white", border: "1px solid #E5E9F0", borderRadius: "16px", padding: "24px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>Chart of Accounts Configuration</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <p style={{ fontSize: "14px", color: "#667085" }}>
                    Initialize or reset the Chart of Accounts (COA) structure. This will create the standard hierarchy for Balance Sheet and Income Statement accounts.
                  </p>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button
                      onClick={handleSeedBalanceSheet}
                      disabled={isSeedingBalanceSheet}
                      style={{
                        height: "40px",
                        padding: "0 20px",
                        borderRadius: "12px",
                        background: isSeedingBalanceSheet ? "#F3F4F6" : "#0F766E",
                        border: "none",
                        color: isSeedingBalanceSheet ? "#9CA3AF" : "#FFFFFF",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: isSeedingBalanceSheet ? "not-allowed" : "pointer",
                        transition: "all 150ms ease",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                    >
                      <RefreshCw className={`w-4 h-4 ${isSeedingBalanceSheet ? 'animate-spin' : ''}`} />
                      {isSeedingBalanceSheet ? "Seeding..." : "Seed Balance Sheet"}
                    </button>
                    
                    <button
                      onClick={handleSeedIncomeStatement}
                      disabled={isSeedingIncomeStatement}
                      style={{
                        height: "40px",
                        padding: "0 20px",
                        borderRadius: "12px",
                        background: isSeedingIncomeStatement ? "#F3F4F6" : "#0F766E",
                        border: "none",
                        color: isSeedingIncomeStatement ? "#9CA3AF" : "#FFFFFF",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: isSeedingIncomeStatement ? "not-allowed" : "pointer",
                        transition: "all 150ms ease",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                    >
                      <RefreshCw className={`w-4 h-4 ${isSeedingIncomeStatement ? 'animate-spin' : ''}`} />
                      {isSeedingIncomeStatement ? "Seeding..." : "Seed Income Statement"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* System Info Tab */}
          <TabsContent value="system">
            <div style={{ background: "white", border: "1px solid #E5E9F0", borderRadius: "16px", padding: "24px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#12332B", marginBottom: "24px" }}>System Information</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: "12px", border: "1px solid #E5E7EB" }}>
                  <p style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Platform</p>
                  <p style={{ fontSize: "15px", color: "#12332B", fontWeight: 500 }}>JJB OS - Logistics Management System</p>
                </div>
                
                <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: "12px", border: "1px solid #E5E7EB" }}>
                  <p style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Version</p>
                  <p style={{ fontSize: "15px", color: "#12332B", fontWeight: 500 }}>v1.0.0</p>
                </div>

                <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: "12px", border: "1px solid #E5E7EB" }}>
                  <p style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Hosted By</p>
                  <p style={{ fontSize: "15px", color: "#12332B", fontWeight: 500 }}>JJB Logistics</p>
                </div>

                <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: "12px", border: "1px solid #E5E7EB" }}>
                  <p style={{ fontSize: "13px", color: "#667085", marginBottom: "8px" }}>Database Backup</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p style={{ fontSize: "14px", color: "#12332B" }}>Last backup: {new Date().toLocaleDateString()}</p>
                    <button
                      style={{
                        height: "32px",
                        padding: "0 16px",
                        borderRadius: "8px",
                        background: "white",
                        border: "1px solid #E5E9F0",
                        color: "#12332B",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: "pointer",
                        transition: "all 150ms ease"
                      }}
                    >
                      Backup Now
                    </button>
                  </div>
                </div>

                <div style={{ padding: "16px", background: "#E8F5E9", borderRadius: "12px", border: "1px solid #C8E6C9" }}>
                  <p style={{ fontSize: "13px", color: "#2E7D32", marginBottom: "8px" }}>System Status</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }}></div>
                    <p style={{ fontSize: "14px", color: "#10b981", fontWeight: 500 }}>All systems operational</p>
                  </div>
                </div>

                {/* Database Cleanup */}
                <div style={{ padding: "16px", background: "#FFF4E5", borderRadius: "12px", border: "1px solid #FFE0B2" }}>
                  <p style={{ fontSize: "13px", color: "#E65100", marginBottom: "8px" }}>Database Maintenance</p>
                  <p style={{ fontSize: "14px", color: "#667085", marginBottom: "12px" }}>Remove duplicate contacts and customers from the database</p>
                  <button
                    onClick={handleCleanupDuplicates}
                    disabled={isCleaningUp}
                    style={{
                      height: "36px",
                      padding: "0 20px",
                      borderRadius: "8px",
                      background: isCleaningUp ? "#F3F4F6" : "#EF4444",
                      border: "none",
                      color: isCleaningUp ? "#9CA3AF" : "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isCleaningUp ? "not-allowed" : "pointer",
                      transition: "all 150ms ease"
                    }}
                  >
                    {isCleaningUp ? "Cleaning up..." : "Clean Up Duplicates"}
                  </button>
                </div>

                {/* Quotation Status Migration */}
                <div style={{ padding: "16px", background: "#F0F9FF", borderRadius: "12px", border: "1px solid #BAE6FD" }}>
                  <p style={{ fontSize: "13px", color: "#0369A1", marginBottom: "8px" }}>Quotation Status Migration</p>
                  <p style={{ fontSize: "14px", color: "#667085", marginBottom: "12px" }}>
                    Update old quotation statuses to new naming convention (Quotation → Priced, Approved → Accepted by Client)
                  </p>
                  <button
                    onClick={handleMigrateQuotationStatuses}
                    disabled={isMigratingStatuses}
                    style={{
                      height: "36px",
                      padding: "0 20px",
                      borderRadius: "8px",
                      background: isMigratingStatuses ? "#F3F4F6" : "#0F766E",
                      border: "none",
                      color: isMigratingStatuses ? "#9CA3AF" : "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isMigratingStatuses ? "not-allowed" : "pointer",
                      transition: "all 150ms ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <RefreshCw className={`w-4 h-4 ${isMigratingStatuses ? 'animate-spin' : ''}`} />
                    {isMigratingStatuses ? "Migrating..." : "Migrate Quotation Statuses"}
                  </button>
                </div>

                {/* Services Metadata Migration */}
                <div style={{ padding: "16px", background: "#FEF3C7", borderRadius: "12px", border: "1px solid #FCD34D" }}>
                  <p style={{ fontSize: "13px", color: "#92400E", marginBottom: "8px" }}>🔧 Fix Services Data Loss Bug</p>
                  <p style={{ fontSize: "14px", color: "#667085", marginBottom: "12px" }}>
                    Migrate services_metadata from camelCase to snake_case for all existing projects and quotations. This fixes the data loss issue where service details show "—" instead of actual values.
                  </p>
                  <button
                    onClick={handleMigrateServicesMetadata}
                    disabled={isMigratingServices}
                    style={{
                      height: "36px",
                      padding: "0 20px",
                      borderRadius: "8px",
                      background: isMigratingServices ? "#F3F4F6" : "#F59E0B",
                      border: "none",
                      color: isMigratingServices ? "#9CA3AF" : "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isMigratingServices ? "not-allowed" : "pointer",
                      transition: "all 150ms ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <RefreshCw className={`w-4 h-4 ${isMigratingServices ? 'animate-spin' : ''}`} />
                    {isMigratingServices ? "Migrating..." : "Fix Services Metadata Now"}
                  </button>
                </div>
                
                {/* Developer Tools */}
                <div style={{ padding: "16px", background: "#EEF2FF", borderRadius: "12px", border: "1px solid #C7D2FE" }}>
                  <p style={{ fontSize: "13px", color: "#4338CA", marginBottom: "8px" }}>Developer Tools</p>
                  <p style={{ fontSize: "14px", color: "#667085", marginBottom: "12px" }}>Testing dashboard for ticketing system development</p>
                  <button
                    onClick={() => navigate('/tickets')}
                    style={{
                      height: "36px",
                      padding: "0 20px",
                      borderRadius: "8px",
                      background: "#FFFFFF",
                      border: "1px solid #C7D2FE",
                      color: "#4338CA",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 150ms ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <TestTube className="w-4 h-4" />
                    Open Ticket Testing Dashboard
                  </button>
                </div>

                {/* Seed Data */}
                <div style={{ padding: "16px", background: "#F0F9FF", borderRadius: "12px", border: "1px solid #BAE6FD" }}>
                  <p style={{ fontSize: "13px", color: "#0369A1", marginBottom: "8px" }}>Seed Data</p>
                  <p style={{ fontSize: "14px", color: "#667085", marginBottom: "12px" }}>
                    Populate the database with comprehensive test data for development and testing purposes
                  </p>
                  <button
                    onClick={handleSeedComprehensiveData}
                    disabled={isSeeding}
                    style={{
                      height: "36px",
                      padding: "0 20px",
                      borderRadius: "8px",
                      background: isSeeding ? "#F3F4F6" : "#0F766E",
                      border: "none",
                      color: isSeeding ? "#9CA3AF" : "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isSeeding ? "not-allowed" : "pointer",
                      transition: "all 150ms ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <RefreshCw className={`w-4 h-4 ${isSeeding ? 'animate-spin' : ''}`} />
                    {isSeeding ? "Seeding..." : "Seed Comprehensive Data"}
                  </button>
                </div>

                {/* Clear Seed Data */}
                <div style={{ padding: "16px", background: "#F0F9FF", borderRadius: "12px", border: "1px solid #BAE6FD" }}>
                  <p style={{ fontSize: "13px", color: "#0369A1", marginBottom: "8px" }}>Clear Seed Data</p>
                  <p style={{ fontSize: "14px", color: "#667085", marginBottom: "12px" }}>
                    Remove all seed data from the database to reset to a clean state
                  </p>
                  <button
                    onClick={handleClearSeedData}
                    disabled={isClearingSeed}
                    style={{
                      height: "36px",
                      padding: "0 20px",
                      borderRadius: "8px",
                      background: isClearingSeed ? "#F3F4F6" : "#EF4444",
                      border: "none",
                      color: isClearingSeed ? "#9CA3AF" : "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isClearingSeed ? "not-allowed" : "pointer",
                      transition: "all 150ms ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <RefreshCw className={`w-4 h-4 ${isClearingSeed ? 'animate-spin' : ''}`} />
                    {isClearingSeed ? "Clearing..." : "Clear All Data"}
                  </button>
                </div>

                {/* Migrate Contact Names */}
                <div style={{ padding: "16px", background: "#F0F9FF", borderRadius: "12px", border: "1px solid #BAE6FD" }}>
                  <p style={{ fontSize: "13px", color: "#0369A1", marginBottom: "8px" }}>Migrate Contact Names</p>
                  <p style={{ fontSize: "14px", color: "#667085", marginBottom: "12px" }}>
                    Migrate contacts from old schema (single 'name' field) to new schema (separate 'first_name' and 'last_name' fields)
                  </p>
                  <button
                    onClick={handleMigrateContactNames}
                    disabled={isMigratingContactNames}
                    style={{
                      height: "36px",
                      padding: "0 20px",
                      borderRadius: "8px",
                      background: isMigratingContactNames ? "#F3F4F6" : "#0F766E",
                      border: "none",
                      color: isMigratingContactNames ? "#9CA3AF" : "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isMigratingContactNames ? "not-allowed" : "pointer",
                      transition: "all 150ms ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <RefreshCw className={`w-4 h-4 ${isMigratingContactNames ? 'animate-spin' : ''}`} />
                    {isMigratingContactNames ? "Migrating..." : "Migrate Contact Names"}
                  </button>
                </div>

                {/* Seed Users */}
                <div style={{ padding: "16px", background: "#ECFDF5", borderRadius: "12px", border: "1px solid #A7F3D0" }}>
                  <p style={{ fontSize: "13px", color: "#047857", marginBottom: "8px", fontWeight: 600 }}>👥 Seed Operations Users</p>
                  <p style={{ fontSize: "14px", color: "#667085", marginBottom: "12px" }}>
                    Populate the database with 30+ test users including complete Operations teams for all service types
                  </p>
                  
                  {/* User breakdown */}
                  <div style={{ 
                    background: "#FFFFFF", 
                    border: "1px solid #D1FAE5", 
                    borderRadius: "8px", 
                    padding: "12px",
                    marginBottom: "12px"
                  }}>
                    <p style={{ fontSize: "12px", color: "#047857", marginBottom: "8px", fontWeight: 600 }}>Users to be created:</p>
                    <div style={{ fontSize: "13px", color: "#374151", lineHeight: "1.8" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <div>• <strong>Forwarding Team:</strong> 6 users</div>
                        <div>• <strong>Brokerage Team:</strong> 6 users</div>
                        <div>• <strong>Trucking Team:</strong> 6 users</div>
                        <div>• <strong>Marine Insurance Team:</strong> 6 users</div>
                        <div>• <strong>Others Team:</strong> 6 users</div>
                        <div>• <strong>BD/Pricing/Exec:</strong> 5 users</div>
                      </div>
                      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #E5E7EB", fontWeight: 600 }}>
                        Total: 35 users (1 Manager, 2 Supervisors, 3 Handlers per service type)
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleSeedUsers}
                    disabled={isSeedingUsers}
                    style={{
                      height: "36px",
                      padding: "0 20px",
                      borderRadius: "8px",
                      background: isSeedingUsers ? "#F3F4F6" : "#0F766E",
                      border: "none",
                      color: isSeedingUsers ? "#9CA3AF" : "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isSeedingUsers ? "not-allowed" : "pointer",
                      transition: "all 150ms ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <RefreshCw className={`w-4 h-4 ${isSeedingUsers ? 'animate-spin' : ''}`} />
                    {isSeedingUsers ? "Seeding..." : "Seed All Users"}
                  </button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}