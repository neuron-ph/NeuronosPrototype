import { useState, useEffect } from 'react';
import { ChevronLeft, Play, Trash2, Clock } from 'lucide-react';
import { apiFetch } from '../../../utils/api';
import { useUser } from '../../../hooks/useUser';

interface SavedReport {
  id: string;
  user_id: string;
  name: string;
  description: string;
  config: any;
  created_at: string;
  last_run: string | null;
}

interface SavedReportsProps {
  onBack: () => void;
  onRunReport: (report: SavedReport) => void;
}

export function SavedReports({ onBack, onRunReport }: SavedReportsProps) {
  const { user } = useUser();
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchSavedReports();
    }
  }, [user]);

  const fetchSavedReports = async () => {
    if (!user) return;

    try {
      const response = await apiFetch(`/reports/saved?user_id=${user.id}`);

      const result = await response.json();
      if (result.success) {
        setReports(result.data);
      }
    } catch (error) {
      console.error('Error fetching saved reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (reportId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete this saved report?')) return;

    try {
      const response = await apiFetch(`/reports/saved/${reportId}?user_id=${user.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (result.success) {
        setReports(reports.filter((r) => r.id !== reportId));
      }
    } catch (error) {
      console.error('Error deleting report:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div style={{ color: '#666' }}>Loading saved reports...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ padding: '32px 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
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
        <h1 style={{ color: '#12332B', marginBottom: '8px' }}>Saved Reports</h1>
        <p style={{ color: '#666' }}>
          Quick access to your frequently used report configurations
        </p>
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '48px' }}>📊</div>
          <div>No saved reports yet</div>
          <p style={{ fontSize: '14px', textAlign: 'center', maxWidth: '400px' }}>
            You can save custom reports from the report results page to quickly access them later
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reports.map((report) => (
            <div
              key={report.id}
              style={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
              }}
            >
              <div style={{ flex: 1 }}>
                <h3 style={{ color: '#12332B', marginBottom: '8px' }}>{report.name}</h3>
                {report.description && (
                  <p style={{ color: '#666', fontSize: '14px', marginBottom: '12px' }}>
                    {report.description}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '24px', fontSize: '14px', color: '#666' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} />
                    Created {new Date(report.created_at).toLocaleDateString()}
                  </div>
                  {report.last_run && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Last run {new Date(report.last_run).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => onRunReport(report)}
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#0D6259';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#0F766E';
                  }}
                >
                  <Play size={16} />
                  Run
                </button>

                <button
                  onClick={() => handleDelete(report.id)}
                  style={{
                    backgroundColor: 'white',
                    color: '#EF4444',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    padding: '10px 20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#FEF2F2';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}