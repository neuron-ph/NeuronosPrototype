import { useState, useEffect } from 'react';
import { ChevronLeft, Download, Save, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../../../utils/api';
import { useUser } from '../../../hooks/useUser';

const COLORS = ['#0F766E', '#14B8A6', '#5EEAD4', '#99F6E4', '#CCFBF1'];

interface ReportResultsProps {
  config: any;
  savedReport?: any;
  onBack: () => void;
}

export function ReportResults({ config, savedReport, onBack }: ReportResultsProps) {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(true);
  const [reportData, setReportData] = useState<any>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');

  useEffect(() => {
    generateReport();
  }, [config]);

  const generateReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch(`/reports/generate`, {
        method: 'POST',
        body: JSON.stringify(config),
      });

      const result = await response.json();
      if (result.success) {
        setReportData(result.data);
      }
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    if (!reportData || !reportData.tableData) return;

    try {
      const response = await apiFetch(`/reports/export`, {
        method: 'POST',
        body: JSON.stringify({
          format,
          data: reportData.tableData,
          filename: `${config.templateName || 'custom_report'}_${new Date().toISOString().split('T')[0]}`,
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Create download link
        const blob = new Blob([result.data.content], { type: result.data.mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.data.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    }
  };

  const handleSaveReport = async () => {
    if (!user || !saveName) return;

    try {
      const response = await apiFetch(`/reports/save`, {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          name: saveName,
          description: saveDescription,
          config,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setShowSaveDialog(false);
        setSaveName('');
        setSaveDescription('');
        alert('Report saved successfully!');
      }
    } catch (error) {
      console.error('Error saving report:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <div style={{ color: '#666' }}>Generating report...</div>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div style={{ color: '#666' }}>Failed to generate report</div>
      </div>
    );
  }

  const { metrics, chartData, tableData, totalRows } = reportData;

  return (
    <div className="h-full flex flex-col" style={{ padding: '32px 48px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#0F766E',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '16px',
              padding: '4px 0',
            }}
          >
            <ChevronLeft size={20} />
            Back to Reports
          </button>
          <h1 style={{ color: '#12332B', marginBottom: '8px' }}>
            {config.templateName || 'Custom Report'}
          </h1>
          <p style={{ color: '#666' }}>
            Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {!savedReport && (
            <button
              onClick={() => setShowSaveDialog(true)}
              style={{
                backgroundColor: 'white',
                border: '1px solid #0F766E',
                color: '#0F766E',
                borderRadius: '6px',
                padding: '10px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Save size={16} />
              Save Report
            </button>
          )}

          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              style={{
                backgroundColor: '#0F766E',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onClick={(e) => {
                const menu = e.currentTarget.nextElementSibling as HTMLElement;
                menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
              }}
            >
              <Download size={16} />
              Export
            </button>
            <div
              style={{
                display: 'none',
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                zIndex: 10,
                minWidth: '150px',
              }}
            >
              <button
                onClick={() => handleExport('csv')}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#12332B',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Export as CSV
              </button>
              <button
                onClick={() => handleExport('excel')}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#12332B',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Export as Excel
              </button>
              <button
                onClick={() => handleExport('pdf')}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#12332B',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Export as PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      {metrics && Object.keys(metrics).length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ color: '#12332B', marginBottom: '16px' }}>Summary Metrics</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            {Object.entries(metrics).map(([key, value]: any) => (
              <div
                key={key}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '20px',
                }}
              >
                <div style={{ color: '#666', fontSize: '14px', marginBottom: '8px', textTransform: 'capitalize' }}>
                  {key.replace(/_/g, ' ')}
                </div>
                <div style={{ color: '#12332B', fontSize: '24px' }}>
                  {typeof value === 'number' && key.includes('amount') || key.includes('value')
                    ? `₱${value.toLocaleString()}`
                    : typeof value === 'number' && key.includes('rate')
                    ? `${value}%`
                    : typeof value === 'number'
                    ? value.toLocaleString()
                    : value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      {chartData && Object.keys(chartData).length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ color: '#12332B', marginBottom: '16px' }}>Visual Analytics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            {chartData.statusDistribution && (
              <div
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '20px',
                }}
              >
                <h3 style={{ color: '#12332B', marginBottom: '16px' }}>Status Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={chartData.statusDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {chartData.statusDistribution.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.monthlyTrend && (
              <div
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '20px',
                }}
              >
                <h3 style={{ color: '#12332B', marginBottom: '16px' }}>Monthly Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke="#0F766E" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.topCustomers && (
              <div
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '20px',
                }}
              >
                <h3 style={{ color: '#12332B', marginBottom: '16px' }}>Top Customers</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.topCustomers}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#0F766E" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.repPerformance && (
              <div
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '20px',
                }}
              >
                <h3 style={{ color: '#12332B', marginBottom: '16px' }}>Rep Performance</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.repPerformance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total_quotations" fill="#0F766E" name="Total Quotations" />
                    <Bar dataKey="won_count" fill="#14B8A6" name="Won" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.pipelineStages && (
              <div
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '20px',
                }}
              >
                <h3 style={{ color: '#12332B', marginBottom: '16px' }}>Pipeline Stages</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.pipelineStages}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="stage" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#0F766E" name="Count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Table */}
      {tableData && tableData.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ color: '#12332B', marginBottom: '16px' }}>
            Detailed Data ({totalRows} total records)
          </h2>
          <div
            style={{
              backgroundColor: 'white',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              overflowX: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {Object.keys(tableData[0]).map((header) => (
                    <th
                      key={header}
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        color: '#12332B',
                        textTransform: 'capitalize',
                      }}
                    >
                      {header.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.slice(0, 100).map((row: any, index: number) => (
                  <tr
                    key={index}
                    style={{
                      borderBottom: '1px solid #E5E7EB',
                    }}
                  >
                    {Object.values(row).map((value: any, cellIndex) => (
                      <td
                        key={cellIndex}
                        style={{
                          padding: '12px 16px',
                          color: '#666',
                        }}
                      >
                        {value !== null && value !== undefined ? String(value) : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {tableData.length > 100 && (
              <div style={{ padding: '16px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
                Showing first 100 rows. Export to view all {totalRows} records.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '500px',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#12332B', marginBottom: '24px' }}>Save Report</h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#666', marginBottom: '8px' }}>
                Report Name *
              </label>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Enter report name..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: '#666', marginBottom: '8px' }}>
                Description (optional)
              </label>
              <textarea
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="Enter description..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSaveDialog(false)}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  color: '#666',
                  borderRadius: '6px',
                  padding: '10px 20px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveReport}
                disabled={!saveName}
                style={{
                  backgroundColor: saveName ? '#0F766E' : '#E5E7EB',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 20px',
                  cursor: saveName ? 'pointer' : 'not-allowed',
                }}
              >
                Save Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}