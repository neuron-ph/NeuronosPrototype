import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Filter, ChevronDown, Calendar, User, ArrowUpDown, FileText, Package, Building, Users, DollarSign } from 'lucide-react';
import { apiFetch } from '../../utils/api';

interface Entity {
  id: string;
  name: string;
  status: string;
  displayName?: string;
  created_at?: string;
  created_by?: string;
  quote_number?: string; // User-facing quote number for quotations
  tracking_number?: string; // User-facing tracking number for bookings
}

interface EntityPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'quotation' | 'booking' | 'customer' | 'expense' | 'contact';
  onSelect: (entity: { id: string; name: string; status: string }) => void;
  contextCustomerId?: string; // For context-aware filtering
  currentUserId?: string; // For "My Items" filtering
}

interface Filters {
  status: string;
  dateFrom: string;
  dateTo: string;
  createdBy: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export function EntityPickerModal({ 
  isOpen, 
  onClose, 
  entityType, 
  onSelect,
  contextCustomerId,
  currentUserId 
}: EntityPickerModalProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  const ITEMS_PER_PAGE = 20;
  
  const [filters, setFilters] = useState<Filters>({
    status: '',
    dateFrom: '',
    dateTo: '',
    createdBy: '',
    sortBy: 'updated_at',
    sortOrder: 'desc'
  });

  // Fetch entities when modal opens or filters change
  useEffect(() => {
    if (isOpen) {
      fetchEntities();
      // Auto-focus search input
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      // Reset state when closed
      setSearchQuery('');
      setEntities([]);
      setOffset(0);
      setSelectedIndex(0);
      setShowAdvancedFilters(false);
    }
  }, [isOpen, entityType, searchQuery, filters, offset]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen) {
        setOffset(0); // Reset to first page on search
        fetchEntities();
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, entities.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && entities[selectedIndex]) {
        e.preventDefault();
        handleSelect(entities[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, entities, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && entities.length > 0) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  const fetchEntities = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      
      // Pagination
      params.append('limit', ITEMS_PER_PAGE.toString());
      params.append('offset', offset.toString());
      
      // Search
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      // Smart defaults: If no search and no filters, show recent items (last 30 days)
      if (!searchQuery.trim() && !filters.dateFrom && !filters.dateTo && !filters.status && !filters.createdBy) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        params.append('date_from', thirtyDaysAgo.toISOString().split('T')[0]);
      }
      
      // Context-aware filtering
      if (contextCustomerId && (entityType === 'quotation' || entityType === 'booking' || entityType === 'contact')) {
        params.append('customer_id', contextCustomerId);
      }
      
      // Advanced filters
      if (filters.status) {
        params.append('status', filters.status);
      }
      
      if (filters.dateFrom) {
        params.append('date_from', filters.dateFrom);
      }
      
      if (filters.dateTo) {
        params.append('date_to', filters.dateTo);
      }
      
      if (filters.createdBy) {
        params.append('created_by', filters.createdBy);
      }
      
      if (currentUserId && filters.createdBy === 'me') {
        params.append('created_by', currentUserId);
      }
      
      // Sorting
      params.append('sort_by', filters.sortBy);
      params.append('sort_order', filters.sortOrder);
      
      const endpoint = `/${entityType}s?${params.toString()}`;
      const response = await apiFetch(endpoint);

      if (!response.ok) {
        throw new Error(`Failed to fetch ${entityType}s`);
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        const formattedEntities = result.data.map((item: any) => formatEntity(item, entityType));
        setEntities(formattedEntities);
        
        // Handle pagination metadata
        if (result.pagination) {
          setTotal(result.pagination.total);
          setHasMore(result.pagination.hasMore);
        }
        
        setSelectedIndex(0); // Reset selection
      } else {
        setError(result.error || 'Failed to load data');
      }
    } catch (err) {
      console.error(`Error fetching ${entityType}s:`, err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const formatEntity = (item: any, type: string): Entity => {
    switch (type) {
      case 'quotation':
        return {
          id: item.id,
          name: item.quotation_name || 'Untitled Quotation',
          status: item.status,
          displayName: item.quotation_name || 'Untitled Quotation',
          created_at: item.created_at,
          created_by: item.created_by,
          quote_number: item.quote_number
        };
      case 'booking':
        return {
          id: item.id,
          name: item.booking_name || 'Untitled Booking',
          status: item.status,
          displayName: item.booking_name || 'Untitled Booking',
          created_at: item.created_at,
          created_by: item.created_by,
          tracking_number: item.tracking_number
        };
      case 'customer':
        return {
          id: item.id,
          name: item.company_name || 'Untitled Customer',
          status: item.status || 'Active',
          displayName: item.company_name,
          created_at: item.created_at
        };
      case 'contact':
        return {
          id: item.id,
          name: item.name || 'Untitled Contact',
          status: item.status || 'Active',
          displayName: `${item.name}${item.company ? ` - ${item.company}` : ''}`,
          created_at: item.created_at
        };
      case 'expense':
        return {
          id: item.id,
          name: item.expense_name || 'Untitled Expense',
          status: item.status,
          displayName: `${item.id} - ${item.expense_name || 'Untitled'}`,
          created_at: item.created_at,
          created_by: item.created_by
        };
      default:
        return {
          id: item.id,
          name: item.name || 'Untitled',
          status: item.status || 'Unknown',
          displayName: item.name,
          created_at: item.created_at
        };
    }
  };

  const handleSelect = (entity: Entity) => {
    onSelect({
      id: entity.id,
      name: entity.name,
      status: entity.status
    });
    onClose();
  };

  const getEntityTypeLabel = (type: string): string => {
    switch (type) {
      case 'quotation': return 'Quotation';
      case 'booking': return 'Booking';
      case 'customer': return 'Customer';
      case 'contact': return 'Contact';
      case 'expense': return 'Expense';
      default: return 'Entity';
    }
  };

  const getEntityIconComponent = (type: string) => {
    const iconProps = { size: 16, style: { color: '#0F766E' } };
    switch (type) {
      case 'quotation': return <FileText {...iconProps} />;
      case 'booking': return <Package {...iconProps} />;
      case 'customer': return <Building {...iconProps} />;
      case 'contact': return <User {...iconProps} />;
      case 'expense': return <DollarSign {...iconProps} />;
      default: return <FileText {...iconProps} />;
    }
  };

  const getStatusColor = (status: string): string => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('draft')) return '#6B7280';
    if (statusLower.includes('pending')) return '#F59E0B';
    if (statusLower.includes('active') || statusLower.includes('approved') || statusLower.includes('completed') || statusLower.includes('quotation')) return '#10B981';
    if (statusLower.includes('rejected') || statusLower.includes('cancelled') || statusLower.includes('disapproved')) return '#EF4444';
    if (statusLower.includes('transit') || statusLower.includes('processing')) return '#3B82F6';
    return '#6B7280';
  };

  const getStatusBgColor = (status: string): string => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('draft')) return '#F3F4F6';
    if (statusLower.includes('pending')) return '#FEF3C7';
    if (statusLower.includes('active') || statusLower.includes('approved') || statusLower.includes('completed') || statusLower.includes('quotation')) return '#D1FAE5';
    if (statusLower.includes('rejected') || statusLower.includes('cancelled') || statusLower.includes('disapproved')) return '#FEE2E2';
    if (statusLower.includes('transit') || statusLower.includes('processing')) return '#DBEAFE';
    return '#F3F4F6';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const loadMore = () => {
    setOffset(prev => prev + ITEMS_PER_PAGE);
  };

  const loadPrevious = () => {
    setOffset(prev => Math.max(0, prev - ITEMS_PER_PAGE));
  };

  const getQuickFilters = () => {
    if (currentUserId) {
      return [
        { label: 'My Items', action: () => setFilters(prev => ({ ...prev, createdBy: currentUserId })) },
        { label: 'All Items', action: () => setFilters(prev => ({ ...prev, createdBy: '' })) }
      ];
    }
    return [];
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(18, 51, 43, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          width: '100%',
          maxWidth: showAdvancedFilters ? '900px' : '700px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--neuron-ui-border)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
          transition: 'max-width 0.2s ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 32px',
            borderBottom: '1px solid var(--neuron-ui-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--neuron-ink-primary)' }}>
              Select {getEntityTypeLabel(entityType)}
            </h2>
            {contextCustomerId && (
              <span style={{ 
                fontSize: '11px', 
                color: 'var(--neuron-teal)', 
                backgroundColor: 'var(--neuron-surface-secondary)',
                padding: '4px 8px',
                borderRadius: '4px'
              }}>
                Filtered by customer
              </span>
            )}
            {!searchQuery.trim() && !filters.dateFrom && !filters.dateTo && !filters.status && !filters.createdBy && !contextCustomerId && (
              <span style={{ 
                fontSize: '11px', 
                color: 'var(--neuron-ink-muted)', 
                backgroundColor: 'var(--neuron-surface-secondary)',
                padding: '4px 8px',
                borderRadius: '4px'
              }}>
                Showing recent items (30 days)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'white',
              border: '1px solid var(--neuron-ui-border)',
              cursor: 'pointer',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--neuron-ink-secondary)',
              borderRadius: '6px',
              fontSize: '13px',
              gap: '6px',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--neuron-surface-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Bar + Filter Toggle */}
        <div style={{ padding: '16px 32px', borderBottom: '1px solid var(--neuron-ui-border)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                flex: 1
              }}
            >
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: 'var(--neuron-ink-muted)'
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={`Search by ID, name, status...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  border: '1px solid var(--neuron-ui-border)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              style={{
                padding: '8px 16px',
                backgroundColor: showAdvancedFilters ? 'var(--neuron-surface-secondary)' : 'white',
                color: 'var(--neuron-ink-primary)',
                border: '1px solid var(--neuron-ui-border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'background-color 0.15s'
              }}
            >
              <Filter size={14} />
              Filters
            </button>
          </div>

          {/* Quick Filters */}
          {getQuickFilters().length > 0 && (
            <div style={{ 
              marginTop: '12px', 
              display: 'flex', 
              gap: '0px',
              borderBottom: '1px solid var(--neuron-ui-border)'
            }}>
              {getQuickFilters().map((filter, idx) => {
                const isActive = (filter.label === 'My Items' && filters.createdBy === currentUserId) ||
                                (filter.label === 'All Items' && filters.createdBy === '');
                return (
                  <button
                    key={idx}
                    onClick={filter.action}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderBottom: isActive ? '2px solid var(--neuron-teal)' : '2px solid transparent',
                      fontSize: '13px',
                      color: isActive ? 'var(--neuron-ink-primary)' : 'var(--neuron-ink-muted)',
                      cursor: 'pointer',
                      fontWeight: isActive ? 500 : 400,
                      transition: 'all 0.15s',
                      marginBottom: '-1px'
                    }}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div style={{ 
            padding: '16px 32px', 
            borderBottom: '1px solid var(--neuron-ui-border)',
            backgroundColor: 'var(--neuron-surface-secondary)'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Status Filter */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--neuron-ink-muted)', marginBottom: '6px' }}>
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    border: '1px solid var(--neuron-ui-border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">All Statuses</option>
                  <option value="Draft">Draft</option>
                  <option value="Pending">Pending</option>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {/* Sort By */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--neuron-ink-muted)', marginBottom: '6px' }}>
                  Sort By
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      border: '1px solid var(--neuron-ui-border)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="updated_at">Last Updated</option>
                    <option value="created_at">Created Date</option>
                  </select>
                  <button
                    onClick={() => setFilters(prev => ({ 
                      ...prev, 
                      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' 
                    }))}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: 'white',
                      border: '1px solid var(--neuron-ui-border)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <ArrowUpDown size={14} />
                  </button>
                </div>
              </div>

              {/* Date From */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--neuron-ink-muted)', marginBottom: '6px' }}>
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    border: '1px solid var(--neuron-ui-border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    backgroundColor: 'white'
                  }}
                />
              </div>

              {/* Date To */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--neuron-ink-muted)', marginBottom: '6px' }}>
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    border: '1px solid var(--neuron-ui-border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    backgroundColor: 'white'
                  }}
                />
              </div>
            </div>

            {/* Clear Filters Button */}
            <button
              onClick={() => setFilters({
                status: '',
                dateFrom: '',
                dateTo: '',
                createdBy: '',
                sortBy: 'updated_at',
                sortOrder: 'desc'
              })}
              style={{
                marginTop: '12px',
                padding: '6px 12px',
                backgroundColor: 'white',
                border: '1px solid var(--neuron-ui-border)',
                borderRadius: '6px',
                fontSize: '11px',
                color: 'var(--neuron-ink-secondary)',
                cursor: 'pointer'
              }}
            >
              Clear All Filters
            </button>
          </div>
        )}

        {/* Results */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 32px 16px 32px'
          }}
        >
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--neuron-ink-muted)' }}>
              Loading {entityType}s...
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#EF4444' }}>
              Error: {error}
            </div>
          )}

          {!isLoading && !error && entities.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--neuron-ink-muted)' }}>
              {searchQuery ? 'No matching records found.' : `No ${entityType}s available.`}
            </div>
          )}

          {!isLoading && !error && entities.length > 0 && (
            <div style={{
              border: '1px solid var(--neuron-ui-border)',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              {/* Table Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 110px 140px',
                  gap: '12px',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--neuron-ui-border)',
                  backgroundColor: 'var(--neuron-surface-secondary)',
                  fontSize: '11px',
                  color: 'var(--neuron-ink-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                <div></div>
                <div>NAME</div>
                <div>DATE</div>
                <div>STATUS</div>
              </div>

              {/* Table Rows */}
              <div>
                {entities.map((entity, index) => {
                  // Get the secondary identifier text (user-facing number or internal ID)
                  const getSecondaryText = () => {
                    if (entityType === 'quotation' && entity.quote_number) {
                      return entity.quote_number;
                    }
                    if (entityType === 'booking' && entity.tracking_number) {
                      return entity.tracking_number;
                    }
                    return entity.id;
                  };
                  
                  return (
                    <div
                      key={entity.id}
                      onClick={() => handleSelect(entity)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr 110px 140px',
                        gap: '12px',
                        padding: '10px 16px',
                        borderBottom: index < entities.length - 1 ? '1px solid var(--neuron-ui-border)' : 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                        backgroundColor: selectedIndex === index ? '#F3F4F6' : (index % 2 === 0 ? 'white' : '#FAFBFC')
                      }}
                      onMouseLeave={(e) => {
                        if (selectedIndex !== index) {
                          e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#FAFBFC';
                        }
                      }}
                    >
                      {/* Icon */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getEntityIconComponent(entityType)}
                      </div>

                      {/* Name Column */}
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
                        <span style={{ 
                          fontSize: '13px', 
                          color: '#111827',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 500
                        }}>
                          {entity.displayName || entity.name}
                        </span>
                        <span style={{ 
                          fontSize: '12px', 
                          color: '#9CA3AF',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: '2px'
                        }}>
                          {getSecondaryText()}
                        </span>
                      </div>

                      {/* Date Column */}
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#667085' }}>
                          {formatDate(entity.created_at || '')}
                        </span>
                      </div>

                      {/* Status Column */}
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            backgroundColor: getStatusBgColor(entity.status),
                            color: getStatusColor(entity.status),
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {entity.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        <div
          style={{
            padding: '16px 32px',
            borderTop: '1px solid var(--neuron-ui-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--neuron-ink-muted)' }}>
            Showing {offset + 1}-{Math.min(offset + ITEMS_PER_PAGE, total)} of {total} records
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {offset > 0 && (
              <button
                onClick={loadPrevious}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'white',
                  color: 'var(--neuron-ink-primary)',
                  border: '1px solid var(--neuron-ui-border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Previous
              </button>
            )}
            {hasMore && (
              <button
                onClick={loadMore}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'var(--neuron-teal)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Load More
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px',
                backgroundColor: 'white',
                color: 'var(--neuron-ink-primary)',
                border: '1px solid var(--neuron-ui-border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}