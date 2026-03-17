import { useState, useEffect } from "react";
import { Search, Plus, BarChart, FileText } from "lucide-react";
import { supabase } from '../../utils/supabase/client';
import { toast } from 'sonner@2.0.3';

type ViewMode = 'list' | 'templates' | 'custom' | 'saved' | 'results' | 'control-center';
type MainTab = 'all' | 'templates' | 'saved';

interface ReportConfig {
  templateId?: string;
  templateName?: string;
  dataSource?: string;
  columns?: string[];
  filters?: any[];
  groupBy?: string[];
  aggregations?: any[];
  sortBy?: any[];
  dateRange?: any;
}

interface SavedReport {
  id: string;
  name: string;
  description?: string;
  config: ReportConfig;
  created_by: string;
  created_at: string;
  last_run?: string;
}

export function BDReports() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [mainTab, setMainTab] = useState<MainTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentReport, setCurrentReport] = useState<any>(null);
  const [reportConfig, setReportConfig] = useState<ReportConfig | null>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  console.log('[BDReports] Component mounted, viewMode:', viewMode, 'savedReports:', savedReports.length);

  // Fetch saved reports on mount
  useEffect(() => {
    fetchSavedReports();
  }, []);

  const fetchSavedReports = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('bd_reports').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setSavedReports(data || []);
    } catch (error) {
      console.error('Error fetching saved reports:', error);
      toast.error('Failed to load saved reports');
      setSavedReports([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunTemplate = (config: ReportConfig) => {
    setReportConfig(config);
    setViewMode('results');
  };

  const handleRunCustom = (config: ReportConfig) => {
    setReportConfig(config);
    setViewMode('results');
  };

  const handleRunSaved = (savedReport: any) => {
    setReportConfig(savedReport.config);
    setCurrentReport(savedReport);
    setViewMode('results');
  };

  const handleBackToHome = () => {
    setViewMode('list');
    setReportConfig(null);
    setCurrentReport(null);
    fetchSavedReports(); // Refresh the list
  };

  const handleCreateFromTemplate = () => {
    setViewMode('templates');
  };

  const handleCreateCustom = () => {
    setViewMode('custom');
  };

  const handleOpenControlCenter = () => {
    setViewMode('control-center');
  };

  // Navigate to sub-views
  if (viewMode === 'templates') {
    return <ReportTemplates onBack={handleBackToHome} onRunReport={handleRunTemplate} />;
  }

  if (viewMode === 'custom') {
    return <CustomReportBuilder onBack={handleBackToHome} onRunReport={handleRunCustom} />;
  }

  if (viewMode === 'saved') {
    return <SavedReports onBack={handleBackToHome} onRunReport={handleRunSaved} />;
  }

  if (viewMode === 'results' && reportConfig) {
    return (
      <ReportResults
        config={reportConfig}
        savedReport={currentReport}
        onBack={handleBackToHome}
      />
    );
  }

  if (viewMode === 'control-center') {
    return <ReportControlCenter onBack={handleBackToHome} />;
  }

  // Filter saved reports
  const filteredReports = savedReports.filter(report => {
    const matchesSearch = !searchQuery || 
      report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (report.description && report.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesSearch;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Main list view
  return (
    <div className="h-full flex flex-col overflow-auto" style={{ background: "#FFFFFF" }}>
      <div style={{ padding: "32px 48px" }}>
        {/* Header */}
        <div 
          className="flex items-center justify-between"
          style={{
            marginBottom: "32px"
          }}
        >
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "#12332B", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              Reports
            </h1>
            <p style={{ fontSize: "14px", color: "#667085" }}>
              Generate insights and export data across all Business Development activities
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleOpenControlCenter}
              className="neuron-btn-primary"
              style={{
                height: "48px",
                padding: "0 24px",
                borderRadius: "16px",
              }}
            >
              <Plus size={20} />
              Build Report
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: "24px" }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#667085",
            }}
          />
          <input
            type="text"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 40px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "8px",
              fontSize: "14px",
              outline: "none",
              color: "var(--neuron-ink-primary)",
              backgroundColor: "#FFFFFF",
            }}
          />
        </div>

        {/* Tab Navigation */}
        <div 
          style={{ 
            display: "flex", 
            gap: "8px", 
            borderBottom: "1px solid var(--neuron-ui-divider)",
            marginBottom: "0"
          }}
        >
          <button
            onClick={() => setMainTab('all')}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px",
              background: "transparent",
              border: "none",
              borderBottom: mainTab === 'all' ? "2px solid #0F766E" : "2px solid transparent",
              color: mainTab === 'all' ? "#0F766E" : "#667085",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              marginBottom: "-1px"
            }}
          >
            <BarChart size={18} />
            All Reports
            <span 
              style={{
                backgroundColor: mainTab === 'all' ? "#E8F5F3" : "#F3F4F6",
                color: mainTab === 'all' ? "#0F766E" : "#667085",
                padding: "2px 8px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600
              }}
            >
              {filteredReports.length}
            </span>
          </button>

          <button
            onClick={() => {
              setMainTab('templates');
              setViewMode('templates');
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px",
              background: "transparent",
              border: "none",
              borderBottom: mainTab === 'templates' ? "2px solid #0F766E" : "2px solid transparent",
              color: mainTab === 'templates' ? "#0F766E" : "#667085",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              marginBottom: "-1px"
            }}
          >
            <FileText size={18} />
            Templates
            <span 
              style={{
                backgroundColor: mainTab === 'templates' ? "#E8F5F3" : "#F3F4F6",
                color: mainTab === 'templates' ? "#0F766E" : "#667085",
                padding: "2px 8px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600
              }}
            >
              5
            </span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p style={{ color: "#667085" }}>Loading reports...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <BarChart size={40} style={{ color: "var(--neuron-ink-muted)", marginBottom: "12px" }} />
            <p style={{ 
              fontSize: "14px",
              color: "var(--neuron-ink-muted)",
              marginBottom: "4px"
            }}>
              No saved reports yet
            </p>
            <p style={{ 
              fontSize: "13px",
              color: "var(--neuron-ink-muted)"
            }}>
              Create your first report using templates or custom builder
            </p>
          </div>
        ) : (
          <div style={{ 
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "10px",
            overflow: "hidden",
            margin: "0 48px 48px 48px"
          }}>
            {/* Table Header */}
            <div 
              className="grid gap-3 px-4 py-2.5"
              style={{ 
                gridTemplateColumns: "40px 1fr 200px 140px 140px",
                borderBottom: "1px solid var(--neuron-ui-divider)",
                background: "#FFFFFF"
              }}
            >
              <div></div>
              <div style={{ 
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--neuron-ink-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Report Name
              </div>
              <div style={{ 
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--neuron-ink-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Data Source
              </div>
              <div style={{ 
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--neuron-ink-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Created
              </div>
              <div style={{ 
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--neuron-ink-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Last Run
              </div>
            </div>

            {/* Table Rows */}
            {filteredReports.map((report, index) => (
              <div
                key={report.id}
                className="grid gap-3 px-4 py-3 transition-colors cursor-pointer"
                style={{ 
                  gridTemplateColumns: "40px 1fr 200px 140px 140px",
                  borderBottom: index < filteredReports.length - 1 ? "1px solid var(--neuron-ui-divider)" : "none"
                }}
                onClick={() => handleRunSaved(report)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#F9FAFB";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {/* Icon */}
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center"
                }}>
                  <BarChart size={16} style={{ color: "#667085" }} />
                </div>

                {/* Report Name */}
                <div>
                  <p style={{ 
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)",
                    marginBottom: "2px"
                  }}>
                    {report.name}
                  </p>
                  {report.description && (
                    <p style={{ 
                      fontSize: "12px",
                      color: "var(--neuron-ink-muted)"
                    }}>
                      {report.description}
                    </p>
                  )}
                </div>

                {/* Data Source */}
                <div>
                  <p style={{ 
                    fontSize: "13px",
                    color: "var(--neuron-ink-muted)"
                  }}>
                    {report.config.dataSource || 'Multiple sources'}
                  </p>
                </div>

                {/* Created Date */}
                <div>
                  <p style={{ 
                    fontSize: "12px",
                    color: "var(--neuron-ink-muted)"
                  }}>
                    {formatDate(report.created_at)}
                  </p>
                </div>

                {/* Last Run */}
                <div>
                  <p style={{ 
                    fontSize: "12px",
                    color: "var(--neuron-ink-muted)"
                  }}>
                    {report.last_run ? formatDate(report.last_run) : 'Never'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}