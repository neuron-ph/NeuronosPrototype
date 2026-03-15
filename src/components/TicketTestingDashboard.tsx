import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { apiFetch } from '../utils/api';
import { useUser } from '../hooks/useUser';
import { AlertCircle, CheckCircle2, Send, User, Calendar, Clock, MessageSquare, CircleDot, Flag } from 'lucide-react';
import { EntityPickerModal } from './ticketing/EntityPickerModal';
import { CustomDropdown } from './bd/CustomDropdown';

interface TicketTestingDashboardProps {
  prefilledEntity?: {
    entityType: string;
    entityId: string;
    entityName: string;
    entityStatus: string;
  } | null;
}

export function TicketTestingDashboard({ prefilledEntity }: TicketTestingDashboardProps = {}) {
  const { user } = useUser();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'types' | 'create' | 'list' | 'detail'>('types');
  
  // Ticket Types State
  const [ticketTypes, setTicketTypes] = useState<any[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  
  // Create Ticket State
  const [ticketType, setTicketType] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [fromDept, setFromDept] = useState('');
  const [toDept, setToDept] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [creating, setCreating] = useState(false);
  
  // Linked Entity State (for creating tickets)
  const [linkedEntityType, setLinkedEntityType] = useState('');
  const [linkedEntityId, setLinkedEntityId] = useState('');
  const [linkedEntityName, setLinkedEntityName] = useState('');
  const [linkedEntityStatus, setLinkedEntityStatus] = useState('');
  const [showEntityPicker, setShowEntityPicker] = useState(false);
  const [useManualEntry, setUseManualEntry] = useState(false);
  
  // Tickets List State
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  
  // Ticket Detail State
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  
  // Users State
  const [users, setUsers] = useState<any[]>([]);
  
  // baseUrl removed — using apiFetch() wrapper
  
  // Fetch ticket types
  const fetchTicketTypes = async () => {
    setLoadingTypes(true);
    try {
      const response = await apiFetch(`/ticket-types`);
      const result = await response.json();
      if (result.success) {
        setTicketTypes(result.data);
      }
    } catch (error) {
      console.error('Error fetching ticket types:', error);
    }
    setLoadingTypes(false);
  };
  
  // Fetch users
  const fetchUsers = async () => {
    try {
      const response = await apiFetch(`/users`);
      const result = await response.json();
      if (result.success) {
        setUsers(result.data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };
  
  // Fetch tickets
  const fetchTickets = async () => {
    setLoadingTickets(true);
    try {
      const params = new URLSearchParams({
        user_id: user?.id || '',
        role: user?.role || '',
        department: user?.department || ''
      });
      
      if (filterStatus) params.append('status', filterStatus);
      if (filterPriority) params.append('priority', filterPriority);
      
      const response = await apiFetch(`/tickets?${params}`);
      const result = await response.json();
      if (result.success) {
        setTickets(result.data);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
    setLoadingTickets(false);
  };
  
  // Fetch ticket detail
  const fetchTicketDetail = async (ticketId: string) => {
    setLoadingDetail(true);
    try {
      const response = await apiFetch(`/tickets/${ticketId}`);
      const result = await response.json();
      if (result.success) {
        setSelectedTicket(result.data);
      }
    } catch (error) {
      console.error('Error fetching ticket detail:', error);
    }
    setLoadingDetail(false);
  };
  
  // Create ticket
  const handleCreateTicket = async () => {
    if (!ticketType || !subject || !fromDept || !toDept) {
      alert('Please fill all required fields');
      return;
    }
    
    setCreating(true);
    try {
      const response = await apiFetch(`/tickets`, {
        method: 'POST',
        body: JSON.stringify({
          ticket_type: ticketType,
          subject,
          description,
          from_department: fromDept,
          to_department: toDept,
          priority,
          created_by: user?.id,
          created_by_name: user?.name,
          linked_entity_type: linkedEntityType,
          linked_entity_id: linkedEntityId,
          linked_entity_name: linkedEntityName,
          linked_entity_status: linkedEntityStatus
        })
      });
      
      const result = await response.json();
      if (result.success) {
        alert(`✅ Ticket created: ${result.data.id}`);
        // Reset form
        setSubject('');
        setDescription('');
        // Switch to list tab
        setActiveTab('list');
        fetchTickets();
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      alert('Error creating ticket');
    }
    setCreating(false);
  };
  
  // Add comment
  const handleAddComment = async () => {
    if (!commentText.trim() || !selectedTicket) return;
    
    setAddingComment(true);
    try {
      const response = await apiFetch(`/tickets/${selectedTicket.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: user?.id,
          user_name: user?.name,
          user_department: user?.department,
          content: commentText
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setCommentText('');
        // Refresh ticket detail
        fetchTicketDetail(selectedTicket.id);
      }
    } catch (error) {
      console.error('Error adding comment:', error);
    }
    setAddingComment(false);
  };
  
  // Update status
  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedTicket) return;
    
    try {
      const response = await apiFetch(`/tickets/${selectedTicket.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      
      const result = await response.json();
      if (result.success) {
        alert(`✅ Status updated to: ${newStatus}`);
        fetchTicketDetail(selectedTicket.id);
        fetchTickets();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };
  
  // Assign ticket
  const handleAssignTicket = async (userId: string, userName: string) => {
    if (!selectedTicket) return;
    
    try {
      const response = await apiFetch(`/tickets/${selectedTicket.id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_to: userId, assigned_to_name: userName })
      });
      
      const result = await response.json();
      if (result.success) {
        alert(`✅ Assigned to: ${userName}`);
        fetchTicketDetail(selectedTicket.id);
        fetchTickets();
      }
    } catch (error) {
      console.error('Error assigning ticket:', error);
    }
  };
  
  // Navigate to linked entity
  const handleOpenLinkedEntity = () => {
    if (!selectedTicket || !selectedTicket.linked_entity_type || !selectedTicket.linked_entity_id) return;
    
    const entityType = selectedTicket.linked_entity_type;
    const entityId = selectedTicket.linked_entity_id;
    
    // Navigate based on entity type
    switch (entityType) {
      case 'quotation':
        // Determine if this is a BD or Pricing quotation based on user department or quotation status
        // For now, we'll assume BD users go to BD inquiries, others go to Pricing quotations
        if (user?.department === 'Business Development') {
          navigate(`/bd/inquiries/${entityId}`);
        } else {
          navigate(`/pricing/quotations/${entityId}`);
        }
        break;
      case 'booking':
        navigate(`/operations/${entityId}`);
        break;
      case 'expense':
        navigate(`/accounting/expenses`);
        break;
      case 'customer':
        if (user?.department === 'Business Development') {
          navigate(`/bd/customers`);
        } else {
          navigate(`/pricing/customers`);
        }
        break;
      case 'contact':
        if (user?.department === 'Business Development') {
          navigate(`/bd/contacts`);
        } else {
          navigate(`/pricing/contacts`);
        }
        break;
      default:
        alert(`Navigation for ${entityType} not yet implemented`);
    }
  };
  
  // Initial load
  useEffect(() => {
    fetchTicketTypes();
    fetchUsers();
  }, []);
  
  useEffect(() => {
    if (activeTab === 'list') {
      fetchTickets();
    }
  }, [activeTab, filterStatus, filterPriority, user]);
  
  // Auto-fill entity data when prefilledEntity is provided
  useEffect(() => {
    if (prefilledEntity) {
      setLinkedEntityType(prefilledEntity.entityType);
      setLinkedEntityId(prefilledEntity.entityId);
      setLinkedEntityName(prefilledEntity.entityName);
      setLinkedEntityStatus(prefilledEntity.entityStatus);
      setActiveTab('create');
    }
  }, [prefilledEntity]);
  
  const departments = ['Business Development', 'Pricing', 'Operations', 'Accounting', 'Executive'];
  const statuses = ['Open', 'Assigned', 'In Progress', 'Waiting on Requester', 'Resolved', 'Closed'];
  const priorities = ['Normal', 'High', 'Urgent'];
  
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return '#DC2626';
      case 'High': return '#EA580C';
      default: return '#2F7F6F';
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return '#2563EB';
      case 'Assigned': return '#7C3AED';
      case 'In Progress': return '#EA580C';
      case 'Waiting on Requester': return '#CA8A04';
      case 'Resolved': return '#059669';
      case 'Closed': return '#64748B';
      default: return '#64748B';
    }
  };
  
  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'quotation': return '📄';
      case 'booking': return '📦';
      case 'customer': return '🏢';
      case 'expense': return '💰';
      case 'contact': return '👤';
      default: return '📎';
    }
  };
  
  const getEntityDisplayName = (entityType: string) => {
    switch (entityType) {
      case 'quotation': return 'Quotation';
      case 'booking': return 'Booking/Project';
      case 'customer': return 'Customer';
      case 'expense': return 'Expense';
      case 'contact': return 'Contact Person';
      default: return 'Record';
    }
  };
  
  return (
    <div style={{ background: 'var(--neuron-bg-page)', minHeight: '100vh', padding: '32px 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ color: 'var(--neuron-ink-primary)', marginBottom: '8px' }}>
          🧪 Ticket System Testing Dashboard
        </h1>
        <p style={{ color: 'var(--neuron-ink-muted)', fontSize: '14px' }}>
          Current User: <strong>{user?.name}</strong> ({user?.department} - {user?.role})
        </p>
      </div>
      
      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px',
        borderBottom: '1px solid var(--neuron-ui-border)',
        paddingBottom: '0'
      }}>
        {[
          { id: 'types', label: 'Ticket Types' },
          { id: 'create', label: 'Create Ticket' },
          { id: 'list', label: 'View Tickets' },
          { id: 'detail', label: 'Ticket Details' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '12px 24px',
              background: activeTab === tab.id ? 'white' : 'transparent',
              border: activeTab === tab.id ? '1px solid var(--neuron-ui-border)' : '1px solid transparent',
              borderBottom: activeTab === tab.id ? '1px solid white' : '1px solid var(--neuron-ui-border)',
              borderRadius: '8px 8px 0 0',
              color: activeTab === tab.id ? 'var(--neuron-brand-green)' : 'var(--neuron-ink-muted)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              marginBottom: '-1px',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <div style={{ background: 'white', padding: '32px', borderRadius: '12px', border: '1px solid var(--neuron-ui-border)' }}>
        
        {/* Ticket Types Tab */}
        {activeTab === 'types' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ color: 'var(--neuron-ink-primary)' }}>Ticket Types</h2>
              <button
                onClick={fetchTicketTypes}
                disabled={loadingTypes}
                style={{
                  padding: '8px 16px',
                  background: 'var(--neuron-brand-green)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                {loadingTypes ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            
            <div style={{ display: 'grid', gap: '16px' }}>
              {ticketTypes.map((type: any) => (
                <div key={type.id} style={{
                  padding: '20px',
                  background: 'var(--neuron-bg-elevated)',
                  borderRadius: '8px',
                  border: '1px solid var(--neuron-ui-border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h3 style={{ color: 'var(--neuron-ink-primary)' }}>{type.name}</h3>
                    <span style={{
                      padding: '4px 12px',
                      background: 'var(--neuron-brand-green-100)',
                      color: 'var(--neuron-brand-green)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>
                      {type.id}
                    </span>
                  </div>
                  <p style={{ color: 'var(--neuron-ink-muted)', fontSize: '14px', marginBottom: '12px' }}>
                    {type.description}
                  </p>
                  <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: 'var(--neuron-ink-secondary)' }}>
                    <div>
                      <strong>From:</strong> {type.default_from_department || 'Any'}
                    </div>
                    <div>
                      <strong>To:</strong> {type.default_to_department || 'Any'}
                    </div>
                    <div>
                      <strong>Due:</strong> {type.default_due_hours} hours
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Create Ticket Tab */}
        {activeTab === 'create' && (
          <div>
            <h2 style={{ color: 'var(--neuron-ink-primary)', marginBottom: '24px' }}>Create New Ticket</h2>
            
            <div style={{ display: 'grid', gap: '20px', maxWidth: '600px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neuron-ink-primary)', fontWeight: 500 }}>
                  Ticket Type *
                </label>
                <select
                  value={ticketType}
                  onChange={(e) => setTicketType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--neuron-ui-border)',
                    borderRadius: '8px',
                    background: 'white',
                    color: 'var(--neuron-ink-primary)'
                  }}
                >
                  <option value="">Select ticket type...</option>
                  {ticketTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neuron-ink-primary)', fontWeight: 500 }}>
                  Subject *
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of the ticket"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--neuron-ui-border)',
                    borderRadius: '8px',
                    background: 'white',
                    color: 'var(--neuron-ink-primary)'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neuron-ink-primary)', fontWeight: 500 }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed description..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--neuron-ui-border)',
                    borderRadius: '8px',
                    background: 'white',
                    color: 'var(--neuron-ink-primary)',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neuron-ink-primary)', fontWeight: 500 }}>
                    From Department *
                  </label>
                  <select
                    value={fromDept}
                    onChange={(e) => setFromDept(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--neuron-ui-border)',
                      borderRadius: '8px',
                      background: 'white',
                      color: 'var(--neuron-ink-primary)'
                    }}
                  >
                    <option value="">Select...</option>
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neuron-ink-primary)', fontWeight: 500 }}>
                    To Department *
                  </label>
                  <select
                    value={toDept}
                    onChange={(e) => setToDept(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--neuron-ui-border)',
                      borderRadius: '8px',
                      background: 'white',
                      color: 'var(--neuron-ink-primary)'
                    }}
                  >
                    <option value="">Select...</option>
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Link to Record Section (Optional) */}
              <div style={{ 
                padding: '20px', 
                background: 'var(--neuron-bg-elevated)', 
                borderRadius: '8px',
                border: '1px solid var(--neuron-ui-border)'
              }}>
                <h3 style={{ color: 'var(--neuron-ink-primary)', marginBottom: '16px', fontSize: '15px' }}>
                  Link to Record (Optional)
                </h3>
                
                <div style={{ display: 'grid', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neuron-ink-primary)', fontWeight: 500 }}>
                      Entity Type
                    </label>
                    <select
                      value={linkedEntityType}
                      onChange={(e) => {
                        setLinkedEntityType(e.target.value);
                        // Reset other fields when type changes
                        if (!e.target.value) {
                          setLinkedEntityId('');
                          setLinkedEntityName('');
                          setLinkedEntityStatus('');
                          setUseManualEntry(false);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid var(--neuron-ui-border)',
                        borderRadius: '8px',
                        background: 'white',
                        color: 'var(--neuron-ink-primary)'
                      }}
                    >
                      <option value="">None (No Link)</option>
                      <option value="quotation">Quotation</option>
                      <option value="booking">Booking/Project</option>
                      <option value="customer">Customer</option>
                      <option value="expense">Expense</option>
                      <option value="contact">Contact Person</option>
                    </select>
                  </div>
                  
                  {linkedEntityType && !linkedEntityId && !useManualEntry && (
                    <div>
                      <button
                        onClick={() => setShowEntityPicker(true)}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'var(--neuron-brand-green)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 600
                        }}
                      >
                        Select {getEntityDisplayName(linkedEntityType)}
                      </button>
                      
                      <div style={{ marginTop: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={useManualEntry}
                            onChange={(e) => setUseManualEntry(e.target.checked)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '13px', color: 'var(--neuron-ink-secondary)' }}>
                            Can't find? Enter manually
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                  
                  {linkedEntityType && linkedEntityId && !useManualEntry && (
                    <div style={{
                      padding: '16px',
                      background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
                      borderRadius: '8px',
                      border: '1px solid var(--neuron-brand-green-100)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '20px' }}>{getEntityIcon(linkedEntityType)}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', color: 'var(--neuron-ink-muted)', marginBottom: '2px' }}>
                            Linked Record
                          </div>
                          <div style={{ fontSize: '14px', color: 'var(--neuron-ink-primary)', fontWeight: 600 }}>
                            {linkedEntityName}
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', marginBottom: '12px' }}>
                        <div>
                          <span style={{ color: 'var(--neuron-ink-muted)' }}>ID: </span>
                          <span style={{ color: 'var(--neuron-ink-primary)', fontFamily: 'monospace' }}>
                            {linkedEntityId}
                          </span>
                        </div>
                        {linkedEntityStatus && (
                          <div>
                            <span style={{ color: 'var(--neuron-ink-muted)' }}>Status: </span>
                            <span style={{
                              padding: '2px 6px',
                              background: 'white',
                              color: 'var(--neuron-brand-green)',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}>
                              {linkedEntityStatus}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => setShowEntityPicker(true)}
                          style={{
                            padding: '6px 12px',
                            background: 'white',
                            color: 'var(--neuron-brand-green)',
                            border: '1px solid var(--neuron-brand-green)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600
                          }}
                        >
                          Change
                        </button>
                        <button
                          onClick={() => {
                            setLinkedEntityId('');
                            setLinkedEntityName('');
                            setLinkedEntityStatus('');
                          }}
                          style={{
                            padding: '6px 12px',
                            background: 'white',
                            color: 'var(--neuron-ink-muted)',
                            border: '1px solid var(--neuron-stroke-primary)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {linkedEntityType && useManualEntry && (
                    <>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neuron-ink-primary)', fontWeight: 500 }}>
                          Record ID
                        </label>
                        <input
                          type="text"
                          value={linkedEntityId}
                          onChange={(e) => setLinkedEntityId(e.target.value)}
                          placeholder={`e.g., ${linkedEntityType === 'quotation' ? 'QUO-1734567890-123' : linkedEntityType === 'booking' ? 'BKG-1734567890-123' : 'customer-1'}`}
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid var(--neuron-ui-border)',
                            borderRadius: '8px',
                            background: 'white',
                            color: 'var(--neuron-ink-primary)'
                          }}
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neuron-ink-primary)', fontWeight: 500 }}>
                          Record Name
                        </label>
                        <input
                          type="text"
                          value={linkedEntityName}
                          onChange={(e) => setLinkedEntityName(e.target.value)}
                          placeholder={`e.g., ${linkedEntityType === 'quotation' ? 'ABC Corp - Manila to Cebu' : linkedEntityType === 'customer' ? 'ABC Corporation' : 'Record name'}`}
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid var(--neuron-ui-border)',
                            borderRadius: '8px',
                            background: 'white',
                            color: 'var(--neuron-ink-primary)'
                          }}
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neuron-ink-primary)', fontWeight: 500 }}>
                          Current Status
                        </label>
                        <input
                          type="text"
                          value={linkedEntityStatus}
                          onChange={(e) => setLinkedEntityStatus(e.target.value)}
                          placeholder={`e.g., ${linkedEntityType === 'quotation' ? 'Draft' : linkedEntityType === 'booking' ? 'In Transit' : 'Active'}`}
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid var(--neuron-ui-border)',
                            borderRadius: '8px',
                            background: 'white',
                            color: 'var(--neuron-ink-primary)'
                          }}
                        />
                      </div>
                      
                      <div>
                        <button
                          onClick={() => setUseManualEntry(false)}
                          style={{
                            padding: '8px 12px',
                            background: 'transparent',
                            color: 'var(--neuron-ink-secondary)',
                            border: '1px solid var(--neuron-stroke-primary)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          ← Back to selection
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              {/* Entity Picker Modal */}
              <EntityPickerModal
                isOpen={showEntityPicker}
                onClose={() => setShowEntityPicker(false)}
                entityType={linkedEntityType as any}
                onSelect={(entity) => {
                  setLinkedEntityId(entity.id);
                  setLinkedEntityName(entity.name);
                  setLinkedEntityStatus(entity.status);
                }}
                currentUserId={user?.id}
              />
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--neuron-ink-primary)', fontWeight: 500 }}>
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--neuron-ui-border)',
                    borderRadius: '8px',
                    background: 'white',
                    color: 'var(--neuron-ink-primary)'
                  }}
                >
                  {priorities.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              
              <button
                onClick={handleCreateTicket}
                disabled={creating}
                style={{
                  padding: '12px 24px',
                  background: 'var(--neuron-brand-green)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.6 : 1,
                  fontSize: '15px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Send size={18} />
                {creating ? 'Creating...' : 'Create Ticket'}
              </button>
            </div>
          </div>
        )}
        
        {/* View Tickets Tab */}
        {activeTab === 'list' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ color: 'var(--neuron-ink-primary)' }}>
                Tickets ({tickets.length})
              </h2>
              <button
                onClick={fetchTickets}
                disabled={loadingTickets}
                style={{
                  padding: '8px 16px',
                  background: 'var(--neuron-brand-green)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                {loadingTickets ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            
            {/* Filters */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
              <CustomDropdown
                value={filterStatus || "All Statuses"}
                onChange={(value) => setFilterStatus(value === "All Statuses" ? "" : value)}
                options={[
                  { value: "All Statuses", label: "All Statuses", icon: <CircleDot size={16} /> },
                  { value: "Open", label: "Open", icon: <CircleDot size={16} style={{ color: "#3B82F6" }} /> },
                  { value: "Assigned", label: "Assigned", icon: <CircleDot size={16} style={{ color: "#8B5CF6" }} /> },
                  { value: "In Progress", label: "In Progress", icon: <CircleDot size={16} style={{ color: "#F59E0B" }} /> },
                  { value: "Waiting on Requester", label: "Waiting on Requester", icon: <CircleDot size={16} style={{ color: "#EF4444" }} /> },
                  { value: "Resolved", label: "Resolved", icon: <CheckCircle2 size={16} style={{ color: "#10B981" }} /> },
                  { value: "Closed", label: "Closed", icon: <CheckCircle2 size={16} style={{ color: "#6B7280" }} /> }
                ]}
                placeholder="Filter by status"
              />
              
              <CustomDropdown
                value={filterPriority || "All Priorities"}
                onChange={(value) => setFilterPriority(value === "All Priorities" ? "" : value)}
                options={[
                  { value: "All Priorities", label: "All Priorities", icon: <Flag size={16} /> },
                  { value: "Normal", label: "Normal", icon: <Flag size={16} style={{ color: "#10B981" }} /> },
                  { value: "High", label: "High", icon: <Flag size={16} style={{ color: "#F59E0B" }} /> },
                  { value: "Urgent", label: "Urgent", icon: <Flag size={16} style={{ color: "#EF4444" }} /> }
                ]}
                placeholder="Filter by priority"
              />
            </div>
            
            {/* Tickets Table */}
            {loadingTickets ? (
              <p style={{ color: 'var(--neuron-ink-muted)' }}>Loading tickets...</p>
            ) : tickets.length === 0 ? (
              <p style={{ color: 'var(--neuron-ink-muted)' }}>No tickets found. Create one to get started!</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--neuron-ui-border)' }}>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neuron-ink-muted)', fontSize: '13px', fontWeight: 600 }}>ID</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neuron-ink-muted)', fontSize: '13px', fontWeight: 600 }}>Subject</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neuron-ink-muted)', fontSize: '13px', fontWeight: 600 }}>Linked To</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neuron-ink-muted)', fontSize: '13px', fontWeight: 600 }}>From → To</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neuron-ink-muted)', fontSize: '13px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neuron-ink-muted)', fontSize: '13px', fontWeight: 600 }}>Priority</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neuron-ink-muted)', fontSize: '13px', fontWeight: 600 }}>Assigned To</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--neuron-ink-muted)', fontSize: '13px', fontWeight: 600 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket: any) => (
                      <tr key={ticket.id} style={{ borderBottom: '1px solid var(--neuron-ui-border)' }}>
                        <td style={{ padding: '12px', fontSize: '13px', color: 'var(--neuron-ink-primary)', fontFamily: 'monospace' }}>
                          {ticket.id}
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', color: 'var(--neuron-ink-primary)' }}>
                          {ticket.subject}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: 'var(--neuron-ink-secondary)' }}>
                          {ticket.linked_entity_type ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{getEntityIcon(ticket.linked_entity_type)}</span>
                              <span>{ticket.linked_entity_id}</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--neuron-ink-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: 'var(--neuron-ink-secondary)' }}>
                          {ticket.from_department} → {ticket.to_department}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '4px 10px',
                            background: `${getStatusColor(ticket.status)}15`,
                            color: getStatusColor(ticket.status),
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600
                          }}>
                            {ticket.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '4px 10px',
                            background: `${getPriorityColor(ticket.priority)}15`,
                            color: getPriorityColor(ticket.priority),
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600
                          }}>
                            {ticket.priority}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: 'var(--neuron-ink-secondary)' }}>
                          {ticket.assigned_to_name || '—'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <button
                            onClick={() => {
                              fetchTicketDetail(ticket.id);
                              setActiveTab('detail');
                            }}
                            style={{
                              padding: '6px 12px',
                              background: 'var(--neuron-brand-green-100)',
                              color: 'var(--neuron-brand-green)',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        
        {/* Ticket Detail Tab */}
        {activeTab === 'detail' && (
          <div>
            {!selectedTicket ? (
              <div style={{ textAlign: 'center', padding: '48px' }}>
                <p style={{ color: 'var(--neuron-ink-muted)', marginBottom: '16px' }}>
                  No ticket selected. Go to "View Tickets" and click on a ticket to see its details.
                </p>
                <button
                  onClick={() => setActiveTab('list')}
                  style={{
                    padding: '10px 20px',
                    background: 'var(--neuron-brand-green)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Go to Tickets
                </button>
              </div>
            ) : loadingDetail ? (
              <p style={{ color: 'var(--neuron-ink-muted)' }}>Loading ticket details...</p>
            ) : (
              <div>
                {/* Ticket Header */}
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ color: 'var(--neuron-ink-primary)', marginBottom: '8px' }}>
                        {selectedTicket.subject}
                      </h2>
                      <p style={{ color: 'var(--neuron-ink-muted)', fontSize: '14px', fontFamily: 'monospace' }}>
                        {selectedTicket.id}
                          </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{
                        padding: '6px 12px',
                        background: `${getStatusColor(selectedTicket.status)}15`,
                        color: getStatusColor(selectedTicket.status),
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600
                      }}>
                        {selectedTicket.status}
                      </span>
                      <span style={{
                        padding: '6px 12px',
                        background: `${getPriorityColor(selectedTicket.priority)}15`,
                        color: getPriorityColor(selectedTicket.priority),
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600
                      }}>
                        {selectedTicket.priority}
                      </span>
                    </div>
                  </div>
                  
                  {/* Meta Info */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                    gap: '16px',
                    padding: '20px',
                    background: 'var(--neuron-bg-elevated)',
                    borderRadius: '8px',
                    marginBottom: '24px'
                  }}>
                    <div>
                      <div style={{ color: 'var(--neuron-ink-muted)', fontSize: '12px', marginBottom: '4px' }}>Created By</div>
                      <div style={{ color: 'var(--neuron-ink-primary)', fontSize: '14px', fontWeight: 500 }}>
                        {selectedTicket.created_by_name}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--neuron-ink-muted)', fontSize: '12px', marginBottom: '4px' }}>From → To</div>
                      <div style={{ color: 'var(--neuron-ink-primary)', fontSize: '14px', fontWeight: 500 }}>
                        {selectedTicket.from_department} → {selectedTicket.to_department}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--neuron-ink-muted)', fontSize: '12px', marginBottom: '4px' }}>Assigned To</div>
                      <div style={{ color: 'var(--neuron-ink-primary)', fontSize: '14px', fontWeight: 500 }}>
                        {selectedTicket.assigned_to_name || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--neuron-ink-muted)', fontSize: '12px', marginBottom: '4px' }}>Due Date</div>
                      <div style={{ color: 'var(--neuron-ink-primary)', fontSize: '14px', fontWeight: 500 }}>
                        {selectedTicket.due_date ? new Date(selectedTicket.due_date).toLocaleString() : '—'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Linked Entity Card */}
                  {selectedTicket.linked_entity_type && (
                    <div style={{
                      padding: '20px',
                      background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
                      borderRadius: '12px',
                      border: '2px solid var(--neuron-brand-green-100)',
                      marginBottom: '24px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <span style={{ fontSize: '28px' }}>{getEntityIcon(selectedTicket.linked_entity_type)}</span>
                        <div>
                          <div style={{ color: 'var(--neuron-ink-muted)', fontSize: '12px', marginBottom: '2px' }}>
                            Linked {getEntityDisplayName(selectedTicket.linked_entity_type)}
                          </div>
                          <div style={{ color: 'var(--neuron-ink-primary)', fontSize: '16px', fontWeight: 600 }}>
                            {selectedTicket.linked_entity_name}
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                          <div>
                            <span style={{ color: 'var(--neuron-ink-muted)' }}>ID: </span>
                            <span style={{ color: 'var(--neuron-ink-primary)', fontFamily: 'monospace', fontWeight: 500 }}>
                              {selectedTicket.linked_entity_id}
                            </span>
                          </div>
                          {selectedTicket.linked_entity_status && (
                            <div>
                              <span style={{ color: 'var(--neuron-ink-muted)' }}>Status: </span>
                              <span style={{
                                padding: '4px 8px',
                                background: 'var(--neuron-brand-green-100)',
                                color: 'var(--neuron-brand-green)',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600
                              }}>
                                {selectedTicket.linked_entity_status}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        <button
                          onClick={handleOpenLinkedEntity}
                          style={{
                            padding: '8px 16px',
                            background: 'var(--neuron-brand-green)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          Open {getEntityDisplayName(selectedTicket.linked_entity_type)} →
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Description */}
                  {selectedTicket.description && (
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ color: 'var(--neuron-ink-primary)', fontSize: '15px', marginBottom: '8px' }}>Description</h3>
                      <p style={{ color: 'var(--neuron-ink-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
                        {selectedTicket.description}
                      </p>
                    </div>
                  )}
                  
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                    <select
                      onChange={(e) => {
                        if (e.target.value) handleUpdateStatus(e.target.value);
                      }}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid var(--neuron-ui-border)',
                        borderRadius: '8px',
                        background: 'white',
                        color: 'var(--neuron-ink-primary)'
                      }}
                    >
                      <option value="">Change Status...</option>
                      {statuses.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          const selectedUser = users.find(u => u.id === e.target.value);
                          if (selectedUser) handleAssignTicket(selectedUser.id, selectedUser.name);
                        }
                      }}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid var(--neuron-ui-border)',
                        borderRadius: '8px',
                        background: 'white',
                        color: 'var(--neuron-ink-primary)'
                      }}
                    >
                      <option value="">Assign To...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.department})</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Comments Section */}
                <div>
                  <h3 style={{ color: 'var(--neuron-ink-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageSquare size={20} />
                    Comments ({selectedTicket.comments?.length || 0})
                  </h3>
                  
                  {/* Add Comment */}
                  <div style={{ marginBottom: '24px' }}>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid var(--neuron-ui-border)',
                        borderRadius: '8px',
                        background: 'white',
                        color: 'var(--neuron-ink-primary)',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        marginBottom: '8px'
                      }}
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={addingComment || !commentText.trim()}
                      style={{
                        padding: '8px 16px',
                        background: 'var(--neuron-brand-green)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: addingComment || !commentText.trim() ? 'not-allowed' : 'pointer',
                        opacity: addingComment || !commentText.trim() ? 0.5 : 1,
                        fontSize: '14px',
                        fontWeight: 600
                      }}
                    >
                      {addingComment ? 'Adding...' : 'Add Comment'}
                    </button>
                  </div>
                  
                  {/* Comments List */}
                  {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {selectedTicket.comments.map((comment: any) => (
                        <div key={comment.id} style={{
                          padding: '16px',
                          background: 'var(--neuron-bg-elevated)',
                          borderRadius: '8px',
                          border: '1px solid var(--neuron-ui-border)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div>
                              <strong style={{ color: 'var(--neuron-ink-primary)' }}>{comment.user_name}</strong>
                              <span style={{ color: 'var(--neuron-ink-muted)', fontSize: '13px', marginLeft: '8px' }}>
                                {comment.user_department}
                              </span>
                            </div>
                            <span style={{ color: 'var(--neuron-ink-muted)', fontSize: '12px' }}>
                              {new Date(comment.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p style={{ color: 'var(--neuron-ink-secondary)', fontSize: '14px', margin: 0 }}>
                            {comment.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--neuron-ink-muted)', fontSize: '14px' }}>No comments yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}