import { useState, useEffect } from 'react';
import { Search, FileText, Plus, BarChart, Download, ChevronDown, ChevronUp, X, Filter } from 'lucide-react';
import { apiFetch } from '../../../utils/api';
import { toast } from 'sonner@2.0.3';

type DataSource = 'quotations' | 'customers' | 'contacts' | 'activities' | 'budget_requests';

interface FilterRow {
  id: string;
  field: string;
  operator: string;
  value: string | string[];
}

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
}

const DATA_SOURCES = [
  { id: 'quotations' as DataSource, label: 'Quotations', icon: '📋', description: 'All quotation records' },
  { id: 'customers' as DataSource, label: 'Customers', icon: '👤', description: 'Customer database' },
  { id: 'contacts' as DataSource, label: 'Contacts', icon: '📞', description: 'Contact records' },
  { id: 'activities' as DataSource, label: 'Activities', icon: '📅', description: 'Activity logs' },
  { id: 'budget_requests' as DataSource, label: 'Budget Requests', icon: '💰', description: 'Budget submissions' },
];

const FIELD_CONFIGS: Record<DataSource, { key: string; label: string; type: string }[]> = {
  quotations: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'customer_name', label: 'Customer', type: 'text' },
    { key: 'service_type', label: 'Service Type', type: 'select' },
    { key: 'status', label: 'Status', type: 'select' },
    { key: 'total_amount', label: 'Amount', type: 'number' },
    { key: 'created_at', label: 'Created Date', type: 'date' },
    { key: 'valid_until', label: 'Valid Until', type: 'date' },
    { key: 'origin', label: 'Origin', type: 'text' },
    { key: 'destination', label: 'Destination', type: 'text' },
    { key: 'assigned_to', label: 'Assigned To', type: 'text' },
  ],
  customers: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'name', label: 'Company Name', type: 'text' },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'status', label: 'Status', type: 'select' },
    { key: 'created_at', label: 'Created Date', type: 'date' },
  ],
  contacts: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'company', label: 'Company', type: 'text' },
    { key: 'created_at', label: 'Created Date', type: 'date' },
  ],
  activities: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'type', label: 'Activity Type', type: 'select' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'created_at', label: 'Date', type: 'date' },
  ],
  budget_requests: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'status', label: 'Status', type: 'select' },
    { key: 'created_at', label: 'Created Date', type: 'date' },
  ],
};

const OPERATORS = {
  text: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
    { value: 'contains', label: 'contains' },
    { value: 'starts_with', label: 'starts with' },
  ],
  select: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
  ],
  number: [
    { value: 'equals', label: '=' },
    { value: 'not_equals', label: '≠' },
    { value: 'greater_than', label: '>' },
    { value: 'less_than', label: '<' },
    { value: 'greater_equal', label: '≥' },
    { value: 'less_equal', label: '≤' },
    { value: 'between', label: 'between' },
  ],
  date: [
    { value: 'is', label: 'is' },
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
    { value: 'between', label: 'between' },
  ],
};

export function ReportsModule() {
  const [dataSource, setDataSource] = useState<DataSource>('quotations');
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [showFilters, setShowFilters] = useState(true);
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // Initialize columns when data source changes
  useEffect(() => {
    const availableFields = FIELD_CONFIGS[dataSource];
    setColumns(
      availableFields.map(field => ({
        key: field.key,
        label: field.label,
        visible: true,
      }))
    );
    setFilters([]); // Clear filters when switching data source
  }, [dataSource]);

  // Fetch results whenever filters or data source change
  useEffect(() => {
    fetchResults();
  }, [dataSource, filters]);

  const fetchResults = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch(`/reports/generate`, {
        method: 'POST',
        body: JSON.stringify({
          dataSource,
          filters: filters.map(f => ({
            field: f.field,
            operator: f.operator,
            value: f.value,
          })),
          columns: columns.filter(c => c.visible).map(c => c.key),
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Backend returns data in format: { success: true, data: { tableData: [...], totalRows: N } }
        const tableData = data.data?.tableData || data.data;
        if (Array.isArray(tableData)) {
          setResults(tableData);
        } else if (Array.isArray(data.data)) {
          setResults(data.data);
        } else {
          console.error('Invalid response format:', data);
          setResults([]);
        }
      } else {
        console.error('Invalid response format:', data);
        setResults([]);
      }
    } catch (error) {
      console.error('Error fetching results:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const addFilter = () => {
    const availableFields = FIELD_CONFIGS[dataSource];
    const firstField = availableFields[0];
    const fieldType = firstField.type;
    const defaultOperator = OPERATORS[fieldType as keyof typeof OPERATORS][0].value;

    setFilters([
      ...filters,
      {
        id: `filter-${Date.now()}`,
        field: firstField.key,
        operator: defaultOperator,
        value: '',
      },
    ]);
  };

  const removeFilter = (id: string) => {
    setFilters(filters.filter(f => f.id !== id));
  };

  const updateFilter = (id: string, updates: Partial<FilterRow>) => {
    setFilters(filters.map(f => (f.id === id ? { ...f, ...updates } : f)));
  };

  const toggleColumn = (key: string) => {
    setColumns(columns.map(c => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };

  const exportData = async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      const response = await apiFetch(`/reports/export`, {
        method: 'POST',
        body: JSON.stringify({
          format,
          dataSource,
          filters,
          columns: columns.filter(c => c.visible).map(c => c.key),
          data: results,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${dataSource}-${Date.now()}.${format}`;
        a.click();
        toast.success(`Report exported as ${format.toUpperCase()}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export report');
    }
  };

  const saveReportConfig = async () => {
    try {
      const reportName = prompt('Enter a name for this report configuration:');
      if (!reportName) return;

      const response = await apiFetch(`/reports/save`, {
        method: 'POST',
        body: JSON.stringify({
          userId: 'user-executive-001',
          name: reportName,
          config: {
            dataSource,
            filters,
            columns: columns.filter(c => c.visible).map(c => c.key),
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Report configuration saved');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save report');
    }
  };

  const getFieldType = (fieldKey: string): string => {
    const field = FIELD_CONFIGS[dataSource].find(f => f.key === fieldKey);
    return field?.type || 'text';
  };

  const visibleColumns = columns.filter(c => c.visible);

  return (
    <div className="h-full flex flex-col overflow-auto" style={{ background: '#FFFFFF' }}>
      <div style={{ padding: '32px 48px' }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 600, color: '#12332B', marginBottom: '4px', letterSpacing: '-1.2px' }}>
              Reports
            </h1>
            <p style={{ fontSize: '14px', color: '#667085' }}>
              Generate insights and export data across all Business Development activities
            </p>
          </div>

          {/* Export Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => exportData('csv')}
              disabled={results.length === 0}
              style={{
                height: '48px',
                padding: '0 20px',
                borderRadius: '16px',
                background: '#FFFFFF',
                border: '1px solid var(--neuron-ui-border)',
                color: results.length === 0 ? '#999' : '#12332B',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: results.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <Download size={18} />
              Export CSV
            </button>
            <button
              onClick={() => exportData('excel')}
              disabled={results.length === 0}
              style={{
                height: '48px',
                padding: '0 20px',
                borderRadius: '16px',
                background: '#FFFFFF',
                border: '1px solid var(--neuron-ui-border)',
                color: results.length === 0 ? '#999' : '#12332B',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: results.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <Download size={18} />
              Export Excel
            </button>
          </div>
        </div>

        {/* Data Source Selector */}
        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#12332B', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Data Source
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
            {DATA_SOURCES.map(source => (
              <button
                key={source.id}
                onClick={() => setDataSource(source.id)}
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  border: `2px solid ${dataSource === source.id ? '#0F766E' : 'var(--neuron-ui-border)'}`,
                  background: dataSource === source.id ? '#F0FDFA' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>{source.icon}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: dataSource === source.id ? '#0F766E' : '#12332B', marginBottom: '4px' }}>
                  {source.label}
                </div>
                <div style={{ fontSize: '12px', color: '#667085' }}>{source.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Filters Section */}
        <div style={{ marginBottom: '24px', border: '1px solid var(--neuron-ui-border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div
            style={{
              padding: '16px 20px',
              background: '#F9FAFB',
              borderBottom: showFilters ? '1px solid var(--neuron-ui-border)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Filter size={18} style={{ color: '#0F766E' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#12332B' }}>Filters</span>
              <span style={{ fontSize: '12px', color: '#667085' }}>({filters.length} active)</span>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#0F766E',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
              {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {showFilters && (
            <div style={{ padding: '20px' }}>
              <button
                onClick={addFilter}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px dashed #0F766E',
                  background: '#F0FDFA',
                  color: '#0F766E',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: filters.length > 0 ? '16px' : '0',
                }}
              >
                <Plus size={16} />
                Add Filter
              </button>

              {filters.map((filter, index) => {
                const fieldType = getFieldType(filter.field);
                const availableOperators = OPERATORS[fieldType as keyof typeof OPERATORS] || OPERATORS.text;

                return (
                  <div
                    key={filter.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '200px 150px 1fr 40px',
                      gap: '12px',
                      marginBottom: index < filters.length - 1 ? '12px' : '0',
                      alignItems: 'center',
                    }}
                  >
                    {/* Field Selector */}
                    <select
                      value={filter.field}
                      onChange={(e) => {
                        const newFieldType = getFieldType(e.target.value);
                        const newOperator = OPERATORS[newFieldType as keyof typeof OPERATORS][0].value;
                        updateFilter(filter.id, { field: e.target.value, operator: newOperator, value: '' });
                      }}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid var(--neuron-ui-border)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: '#12332B',
                        background: '#FFFFFF',
                        cursor: 'pointer',
                      }}
                    >
                      {FIELD_CONFIGS[dataSource].map(field => (
                        <option key={field.key} value={field.key}>
                          {field.label}
                        </option>
                      ))}
                    </select>

                    {/* Operator Selector */}
                    <select
                      value={filter.operator}
                      onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid var(--neuron-ui-border)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: '#12332B',
                        background: '#FFFFFF',
                        cursor: 'pointer',
                      }}
                    >
                      {availableOperators.map(op => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>

                    {/* Value Input */}
                    <input
                      type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                      value={filter.value as string}
                      onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                      placeholder="Enter value..."
                      style={{
                        padding: '10px 12px',
                        border: '1px solid var(--neuron-ui-border)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: '#12332B',
                        background: '#FFFFFF',
                      }}
                    />

                    {/* Remove Button */}
                    <button
                      onClick={() => removeFilter(filter.id)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        border: '1px solid var(--neuron-ui-border)',
                        background: '#FFFFFF',
                        color: '#999',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#EF4444';
                        e.currentTarget.style.color = '#EF4444';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--neuron-ui-border)';
                        e.currentTarget.style.color = '#999';
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Column Selector */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--neuron-ui-border)',
              background: '#FFFFFF',
              color: '#12332B',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <BarChart size={16} />
            Columns ({visibleColumns.length}/{columns.length})
            <ChevronDown size={14} />
          </button>

          {showColumnPicker && (
            <div
              style={{
                position: 'absolute',
                marginTop: '8px',
                padding: '12px',
                background: '#FFFFFF',
                border: '1px solid var(--neuron-ui-border)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 10,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                maxWidth: '600px',
              }}
            >
              {columns.map(col => (
                <label
                  key={col.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--neuron-ui-border)',
                    background: col.visible ? '#F0FDFA' : '#FFFFFF',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: col.visible ? '#0F766E' : '#667085',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={() => toggleColumn(col.key)}
                    style={{ cursor: 'pointer' }}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}

          <span style={{ fontSize: '13px', color: '#667085' }}>
            Showing {results.length} {results.length === 1 ? 'row' : 'rows'}
          </span>
        </div>
      </div>

      {/* Results Table */}
      <div className="flex-1 overflow-auto" style={{ padding: '0 48px 48px 48px' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p style={{ color: '#667085' }}>Loading results...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <BarChart size={40} style={{ color: '#CBD5E1', marginBottom: '12px' }} />
            <p style={{ fontSize: '14px', color: '#667085', marginBottom: '4px' }}>No results found</p>
            <p style={{ fontSize: '13px', color: '#999' }}>Try adjusting your filters or data source</p>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--neuron-ui-border)', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Table Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(150px, 1fr))`,
                gap: '12px',
                padding: '12px 16px',
                background: '#F9FAFB',
                borderBottom: '1px solid var(--neuron-ui-border)',
              }}
            >
              {visibleColumns.map(col => (
                <div
                  key={col.key}
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--neuron-ink-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {col.label}
                </div>
              ))}
            </div>

            {/* Table Rows */}
            {results.map((row, index) => (
              <div
                key={index}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(150px, 1fr))`,
                  gap: '12px',
                  padding: '14px 16px',
                  borderBottom: index < results.length - 1 ? '1px solid var(--neuron-ui-divider)' : 'none',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {visibleColumns.map(col => (
                  <div key={col.key} style={{ fontSize: '13px', color: '#12332B' }}>
                    {row[col.key] || '-'}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Report Button */}
      <div style={{ padding: '0 48px 32px 48px' }}>
        <button
          onClick={saveReportConfig}
          style={{
            padding: '12px 24px',
            borderRadius: '12px',
            border: '1px solid var(--neuron-ui-border)',
            background: '#FFFFFF',
            color: '#12332B',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FileText size={18} />
          Save Report Configuration
        </button>
      </div>
    </div>
  );
}