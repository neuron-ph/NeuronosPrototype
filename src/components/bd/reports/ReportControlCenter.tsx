import { useState, useEffect } from 'react';
import { Plus, X, Download, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../../utils/api';
import { toast } from 'sonner@2.0.3';

interface ReportControlCenterProps {
  onBack: () => void;
}

interface FieldDef {
  entity: string;
  field: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
}

interface SelectedField {
  entity: string;
  field: string;
  displayLabel: string;
}

interface Filter {
  entity: string;
  field: string;
  fieldLabel: string;
  operator: string;
  value: string;
}

interface Aggregation {
  id: string;
  name: string;
  function: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
  entity: string;
  field: string;
}

// Define all available fields from all entities
const ALL_FIELDS: FieldDef[] = [
  // Quotations
  { entity: 'quotations', field: 'id', label: 'Quotation ID', type: 'text' },
  { entity: 'quotations', field: 'quotation_name', label: 'Quotation Name', type: 'text' },
  { entity: 'quotations', field: 'status', label: 'Quotation Status', type: 'select', options: ['Draft', 'Sent to Client', 'Won', 'Lost'] },
  { entity: 'quotations', field: 'total_amount', label: 'Quotation Amount', type: 'number' },
  { entity: 'quotations', field: 'valid_until', label: 'Quotation Valid Until', type: 'date' },
  { entity: 'quotations', field: 'created_at', label: 'Quotation Created Date', type: 'date' },
  { entity: 'quotations', field: 'updated_at', label: 'Quotation Updated Date', type: 'date' },
  { entity: 'quotations', field: 'transit_days', label: 'Quotation Transit Days', type: 'number' },
  { entity: 'quotations', field: 'created_by', label: 'Quotation Created By', type: 'text' },
  
  // Customers
  { entity: 'customers', field: 'id', label: 'Customer ID', type: 'text' },
  { entity: 'customers', field: 'company_name', label: 'Customer Name', type: 'text' },
  { entity: 'customers', field: 'industry', label: 'Customer Industry', type: 'text' },
  { entity: 'customers', field: 'country', label: 'Customer Country', type: 'text' },
  { entity: 'customers', field: 'status', label: 'Customer Status', type: 'select', options: ['Active', 'Inactive', 'Lead'] },
  { entity: 'customers', field: 'created_at', label: 'Customer Created Date', type: 'date' },
  { entity: 'customers', field: 'updated_at', label: 'Customer Updated Date', type: 'date' },
  
  // Contacts
  { entity: 'contacts', field: 'id', label: 'Contact ID', type: 'text' },
  { entity: 'contacts', field: 'name', label: 'Contact Name', type: 'text' },
  { entity: 'contacts', field: 'email', label: 'Contact Email', type: 'text' },
  { entity: 'contacts', field: 'phone', label: 'Contact Phone', type: 'text' },
  { entity: 'contacts', field: 'position', label: 'Contact Position', type: 'text' },
  { entity: 'contacts', field: 'created_at', label: 'Contact Created Date', type: 'date' },
  
  // Activities
  { entity: 'activities', field: 'id', label: 'Activity ID', type: 'text' },
  { entity: 'activities', field: 'title', label: 'Activity Title', type: 'text' },
  { entity: 'activities', field: 'type', label: 'Activity Type', type: 'select', options: ['Call', 'Meeting', 'Email', 'Task', 'Note'] },
  { entity: 'activities', field: 'description', label: 'Activity Description', type: 'text' },
  { entity: 'activities', field: 'status', label: 'Activity Status', type: 'select', options: ['Pending', 'Completed', 'Cancelled'] },
  { entity: 'activities', field: 'created_at', label: 'Activity Date', type: 'date' },
  { entity: 'activities', field: 'created_by', label: 'Activity Created By', type: 'text' },
  
  // Budget Requests
  { entity: 'budget_requests', field: 'id', label: 'Budget Request ID', type: 'text' },
  { entity: 'budget_requests', field: 'purpose', label: 'Budget Purpose', type: 'text' },
  { entity: 'budget_requests', field: 'amount', label: 'Budget Amount', type: 'number' },
  { entity: 'budget_requests', field: 'status', label: 'Budget Status', type: 'select', options: ['Pending', 'Approved', 'Rejected'] },
  { entity: 'budget_requests', field: 'requested_by', label: 'Budget Requested By', type: 'text' },
  { entity: 'budget_requests', field: 'created_at', label: 'Budget Request Date', type: 'date' },
];

const FIELDS_BY_ENTITY = ALL_FIELDS.reduce((acc, field) => {
  if (!acc[field.entity]) {
    acc[field.entity] = [];
  }
  acc[field.entity].push(field);
  return acc;
}, {} as Record<string, FieldDef[]>);

const ENTITY_LABELS: Record<string, string> = {
  quotations: 'Quotations',
  customers: 'Customers',
  contacts: 'Contacts',
  activities: 'Activities',
  budget_requests: 'Budget Requests',
};

const OPERATORS_BY_TYPE: Record<string, Array<{ value: string; label: string }>> = {
  text: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
    { value: 'contains', label: 'contains' },
    { value: 'starts_with', label: 'starts with' },
  ],
  number: [
    { value: 'equals', label: '=' },
    { value: 'not_equals', label: '≠' },
    { value: 'greater_than', label: '>' },
    { value: 'less_than', label: '<' },
    { value: 'greater_than_or_equal', label: '≥' },
    { value: 'less_than_or_equal', label: '≤' },
  ],
  date: [
    { value: 'equals', label: 'is' },
    { value: 'date_after', label: 'after' },
    { value: 'date_before', label: 'before' },
    { value: 'date_between', label: 'between' },
  ],
  select: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
  ],
};

export function ReportControlCenter({ onBack }: ReportControlCenterProps) {
  const [selectedFields, setSelectedFields] = useState<SelectedField[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [aggregations, setAggregations] = useState<Aggregation[]>([]);
  
  // Expansion states
  const [expandedEntities, setExpandedEntities] = useState<Record<string, boolean>>({});
  const [fieldSearchQuery, setFieldSearchQuery] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [reportResults, setReportResults] = useState<any[]>([]);
  const [resultColumns, setResultColumns] = useState<string[]>([]);

  // Auto-run report when selections change
  useEffect(() => {
    if (selectedFields.length > 0) {
      handleRunReport();
    } else {
      setReportResults([]);
      setResultColumns([]);
    }
  }, [selectedFields, filters, aggregations]);

  const handleRunReport = async () => {
    setIsLoading(true);
    try {
      const config = {
        selectedFields,
        filters,
        groupBy: [],
        aggregations,
      };

      const response = await apiFetch(`/reports/control-center`, {
        method: 'POST',
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      const data = await response.json();
      if (data.success) {
        setReportResults(data.data || []);
        setResultColumns(data.columns || []);
      } else {
        throw new Error(data.error || 'Failed to generate report');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error(String(error));
      setReportResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleField = (field: FieldDef) => {
    const fieldKey = `${field.entity}.${field.field}`;
    const exists = selectedFields.find(f => `${f.entity}.${f.field}` === fieldKey);
    
    if (exists) {
      setSelectedFields(selectedFields.filter(f => `${f.entity}.${f.field}` !== fieldKey));
    } else {
      setSelectedFields([
        ...selectedFields,
        {
          entity: field.entity,
          field: field.field,
          displayLabel: field.label,
        }
      ]);
    }
  };

  const toggleEntity = (entity: string) => {
    setExpandedEntities(prev => ({
      ...prev,
      [entity]: !prev[entity]
    }));
  };

  const handleRemoveField = (index: number) => {
    setSelectedFields(selectedFields.filter((_, i) => i !== index));
  };

  const handleAddFilter = () => {
    const firstField = ALL_FIELDS[0];
    setFilters([
      ...filters,
      {
        entity: firstField.entity,
        field: firstField.field,
        fieldLabel: firstField.label,
        operator: 'equals',
        value: '',
      }
    ]);
  };

  const handleUpdateFilter = (index: number, updates: Partial<Filter>) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], ...updates };
    
    if (updates.field || updates.entity) {
      const fieldDef = ALL_FIELDS.find(
        f => f.entity === newFilters[index].entity && f.field === newFilters[index].field
      );
      if (fieldDef) {
        newFilters[index].fieldLabel = fieldDef.label;
        newFilters[index].operator = OPERATORS_BY_TYPE[fieldDef.type][0].value;
      }
    }
    
    setFilters(newFilters);
  };

  const handleRemoveFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const handleAddCalculation = () => {
    const firstNumberField = ALL_FIELDS.find(f => f.type === 'number') || ALL_FIELDS[0];
    setAggregations([
      ...aggregations,
      {
        id: `calc-${Date.now()}`,
        name: `New Calculation`,
        function: 'SUM',
        entity: firstNumberField.entity,
        field: firstNumberField.field,
      }
    ]);
  };

  const handleUpdateCalculation = (index: number, updates: Partial<Aggregation>) => {
    const newAggs = [...aggregations];
    newAggs[index] = { ...newAggs[index], ...updates };
    setAggregations(newAggs);
  };

  const handleRemoveCalculation = (index: number) => {
    setAggregations(aggregations.filter((_, i) => i !== index));
  };

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      const response = await apiFetch(`/reports/export`, {
        method: 'POST',
        body: JSON.stringify({
          format,
          data: reportResults,
          columns: resultColumns,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${Date.now()}.${format}`;
        a.click();
        toast.success(`Report exported as ${format.toUpperCase()}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export report');
    }
  };

  const getFieldDef = (entity: string, field: string) => {
    return ALL_FIELDS.find(f => f.entity === entity && f.field === field);
  };

  const getSelectedCountForEntity = (entity: string) => {
    return selectedFields.filter(f => f.entity === entity).length;
  };

  // Filter fields for search
  const filteredFields = ALL_FIELDS.filter(field => 
    fieldSearchQuery === '' || 
    field.label.toLowerCase().includes(fieldSearchQuery.toLowerCase()) ||
    ENTITY_LABELS[field.entity].toLowerCase().includes(fieldSearchQuery.toLowerCase())
  );

  const filteredFieldsByEntity = filteredFields.reduce((acc, field) => {
    if (!acc[field.entity]) {
      acc[field.entity] = [];
    }
    acc[field.entity].push(field);
    return acc;
  }, {} as Record<string, FieldDef[]>);

  return (
    <div className="h-full flex flex-col overflow-auto" style={{ background: '#FFFFFF', padding: '32px 48px' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#12332B', marginBottom: '4px', letterSpacing: '-0.8px' }}>
            Reports
          </h1>
          <p style={{ fontSize: '12px', color: '#667085' }}>
            Build custom reports from any data source
          </p>
        </div>

        {/* Export Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleExport('csv')}
            disabled={reportResults.length === 0}
            style={{
              height: '36px',
              padding: '0 16px',
              borderRadius: '12px',
              background: '#FFFFFF',
              border: '1px solid var(--neuron-ui-border)',
              color: reportResults.length === 0 ? '#999' : '#12332B',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: reportResults.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={14} />
            Export CSV
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={reportResults.length === 0}
            style={{
              height: '36px',
              padding: '0 16px',
              borderRadius: '12px',
              background: '#FFFFFF',
              border: '1px solid var(--neuron-ui-border)',
              color: reportResults.length === 0 ? '#999' : '#12332B',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: reportResults.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={14} />
            Export Excel
          </button>
        </div>
      </div>

      {/* SECTION 1: FIELDS */}
      <div style={{ marginBottom: '16px', border: '1px solid var(--neuron-ui-border)', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#12332B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            FIELDS
          </div>
          <span style={{ fontSize: '10px', color: '#667085', background: '#E5E7EB', padding: '2px 8px', borderRadius: '6px' }}>
            {selectedFields.length} selected
          </span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#667085' }} />
          <input
            type="text"
            placeholder="Search fields..."
            value={fieldSearchQuery}
            onChange={(e) => setFieldSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              border: '1px solid var(--neuron-ui-border)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#12332B',
            }}
          />
        </div>

        {/* Expandable Entity Sections */}
        {Object.entries(filteredFieldsByEntity).map(([entity, fields]) => {
          const selectedCount = getSelectedCountForEntity(entity);
          const isExpanded = expandedEntities[entity];

          return (
            <div key={entity} style={{ marginBottom: '8px' }}>
              {/* Entity Header - Clickable */}
              <button
                onClick={() => toggleEntity(entity)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: isExpanded ? '#F0FDFA' : '#F9FAFB',
                  border: '1px solid var(--neuron-ui-border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isExpanded ? <ChevronDown size={16} color="#0F766E" /> : <ChevronRight size={16} color="#667085" />}
                  <span style={{ fontSize: '12px', fontWeight: 600, color: isExpanded ? '#0F766E' : '#12332B' }}>
                    {ENTITY_LABELS[entity]}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: '#667085', background: '#FFFFFF', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--neuron-ui-border)' }}>
                  {selectedCount}/{fields.length}
                </span>
              </button>

              {/* Expanded Field Checkboxes */}
              {isExpanded && (
                <div style={{ 
                  marginTop: '8px', 
                  marginLeft: '24px',
                  padding: '12px',
                  background: '#FAFBFC',
                  borderRadius: '8px',
                  border: '1px solid var(--neuron-ui-divider)'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {fields.map(field => {
                      const isSelected = selectedFields.some(f => f.entity === entity && f.field === field.field);
                      return (
                        <label
                          key={`${entity}.${field.field}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: isSelected ? '#F0FDFA' : '#FFFFFF',
                            border: '1px solid ' + (isSelected ? '#0F766E' : 'var(--neuron-ui-divider)'),
                            cursor: 'pointer',
                            fontSize: '11px',
                            color: isSelected ? '#0F766E' : '#12332B',
                            transition: 'all 0.1s ease',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleField(field)}
                            style={{ cursor: 'pointer', accentColor: '#0F766E' }}
                          />
                          {field.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* SECTION 2: FILTERS */}
      <div style={{ marginBottom: '16px', border: '1px solid var(--neuron-ui-border)', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#12332B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            FILTERS
          </div>
          <span style={{ fontSize: '10px', color: '#667085', background: '#E5E7EB', padding: '2px 8px', borderRadius: '6px' }}>
            {filters.length} active
          </span>
        </div>

        <button
          onClick={handleAddFilter}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px dashed #0F766E',
            background: '#F0FDFA',
            color: '#0F766E',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: filters.length > 0 ? '12px' : '0',
          }}
        >
          <Plus size={14} />
          Add Filter
        </button>

        {/* Filter Rows */}
        {filters.map((filter, index) => {
          const fieldDef = getFieldDef(filter.entity, filter.field);
          const operators = fieldDef ? OPERATORS_BY_TYPE[fieldDef.type] : OPERATORS_BY_TYPE.text;

          return (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 120px 1fr 32px',
                gap: '8px',
                marginBottom: index < filters.length - 1 ? '8px' : '0',
                alignItems: 'center',
              }}
            >
              {/* Field Selector */}
              <select
                value={`${filter.entity}.${filter.field}`}
                onChange={(e) => {
                  const [entity, field] = e.target.value.split('.');
                  handleUpdateFilter(index, { entity, field });
                }}
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--neuron-ui-border)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#12332B',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                {ALL_FIELDS.map(f => (
                  <option key={`${f.entity}.${f.field}`} value={`${f.entity}.${f.field}`}>
                    {f.label}
                  </option>
                ))}
              </select>

              {/* Operator Selector */}
              <select
                value={filter.operator}
                onChange={(e) => handleUpdateFilter(index, { operator: e.target.value })}
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--neuron-ui-border)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#12332B',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                {operators.map(op => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>

              {/* Value Input */}
              {fieldDef?.type === 'select' ? (
                <select
                  value={filter.value}
                  onChange={(e) => handleUpdateFilter(index, { value: e.target.value })}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--neuron-ui-border)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#12332B',
                    background: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Select...</option>
                  {fieldDef.options?.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={fieldDef?.type === 'number' ? 'number' : fieldDef?.type === 'date' ? 'date' : 'text'}
                  value={filter.value}
                  onChange={(e) => handleUpdateFilter(index, { value: e.target.value })}
                  placeholder="Enter value..."
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--neuron-ui-border)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#12332B',
                    background: '#FFFFFF',
                  }}
                />
              )}

              {/* Remove Button */}
              <button
                onClick={() => handleRemoveFilter(index)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: '1px solid var(--neuron-ui-border)',
                  background: '#FFFFFF',
                  color: '#999',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* SECTION 3: CALCULATIONS */}
      <div style={{ marginBottom: '24px', border: '1px solid var(--neuron-ui-border)', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#12332B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            CALCULATIONS
          </div>
          <span style={{ fontSize: '10px', color: '#667085', background: '#E5E7EB', padding: '2px 8px', borderRadius: '6px' }}>
            {aggregations.length} created
          </span>
        </div>

        <button
          onClick={handleAddCalculation}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px dashed #0F766E',
            background: '#F0FDFA',
            color: '#0F766E',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: aggregations.length > 0 ? '12px' : '0',
          }}
        >
          <Plus size={14} />
          Add Calculation
        </button>

        {/* Calculations */}
        {aggregations.map((agg, index) => (
          <div
            key={agg.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 100px 1fr 32px',
              gap: '8px',
              marginBottom: index < aggregations.length - 1 ? '8px' : '0',
              alignItems: 'center',
            }}
          >
            {/* Calculation Name */}
            <input
              type="text"
              value={agg.name}
              onChange={(e) => handleUpdateCalculation(index, { name: e.target.value })}
              placeholder="Calculation name"
              style={{
                padding: '8px 10px',
                border: '1px solid var(--neuron-ui-border)',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#12332B',
                background: '#FFFFFF',
              }}
            />

            {/* Function */}
            <select
              value={agg.function}
              onChange={(e) => handleUpdateCalculation(index, { function: e.target.value as any })}
              style={{
                padding: '8px 10px',
                border: '1px solid var(--neuron-ui-border)',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#12332B',
                background: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <option value="SUM">SUM</option>
              <option value="AVG">AVG</option>
              <option value="COUNT">COUNT</option>
              <option value="MIN">MIN</option>
              <option value="MAX">MAX</option>
            </select>

            {/* Field */}
            <select
              value={`${agg.entity}.${agg.field}`}
              onChange={(e) => {
                const [entity, field] = e.target.value.split('.');
                handleUpdateCalculation(index, { entity, field });
              }}
              style={{
                padding: '8px 10px',
                border: '1px solid var(--neuron-ui-border)',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#12332B',
                background: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              {ALL_FIELDS.filter(f => f.type === 'number').map(f => (
                <option key={`${f.entity}.${f.field}`} value={`${f.entity}.${f.field}`}>
                  {f.label}
                </option>
              ))}
            </select>

            {/* Remove Button */}
            <button
              onClick={() => handleRemoveCalculation(index)}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                border: '1px solid var(--neuron-ui-border)',
                background: '#FFFFFF',
                color: '#999',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* RESULTS TABLE - Always Visible */}
      <div style={{ border: '1px solid var(--neuron-ui-border)', borderRadius: '12px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', background: '#F9FAFB', borderBottom: '1px solid var(--neuron-ui-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#12332B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>RESULTS</span>
            <span style={{ fontSize: '10px', color: '#667085', marginLeft: '12px' }}>
              {isLoading ? 'Loading...' : `${reportResults.length} rows`}
            </span>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {reportResults.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#667085' }}>
              <p style={{ fontSize: '12px' }}>Select fields to generate a report</p>
            </div>
          ) : (
            <div style={{ border: '1px solid var(--neuron-ui-border)', borderRadius: '8px', overflow: 'hidden' }}>
              {/* Table Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${resultColumns.length}, minmax(120px, 1fr))`,
                  gap: '12px',
                  padding: '10px 14px',
                  background: '#F9FAFB',
                  borderBottom: '1px solid var(--neuron-ui-border)',
                }}
              >
                {resultColumns.map(col => (
                  <div
                    key={col}
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: '#667085',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {col}
                  </div>
                ))}
              </div>

              {/* Table Rows */}
              {reportResults.map((row, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${resultColumns.length}, minmax(120px, 1fr))`,
                    gap: '12px',
                    padding: '12px 14px',
                    borderBottom: index < reportResults.length - 1 ? '1px solid var(--neuron-ui-divider)' : 'none',
                  }}
                >
                  {resultColumns.map(col => (
                    <div key={col} style={{ fontSize: '11px', color: '#12332B' }}>
                      {row[col] || '-'}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}