import { useState, useEffect } from 'react';
import { ChevronLeft, Play } from 'lucide-react';
import { apiFetch } from '../../../utils/api';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

interface ReportTemplatesProps {
  onBack: () => void;
  onRunReport: (config: any) => void;
}

export function ReportTemplates({ onBack, onRunReport }: ReportTemplatesProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await apiFetch('/reports/templates');

      const result = await response.json();
      if (result.success) {
        setTemplates(result.data);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunTemplate = (template: Template) => {
    onRunReport({
      templateId: template.id,
      templateName: template.name,
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div style={{ color: '#666' }}>Loading templates...</div>
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
        <h1 style={{ color: '#12332B', marginBottom: '8px' }}>Pre-built Templates</h1>
        <p style={{ color: '#666' }}>
          Select a template to generate instant insights with pre-configured filters
        </p>
      </div>

      {/* Templates Grid */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
          gap: '24px'
        }}
      >
        {templates.map((template) => (
          <div
            key={template.id}
            style={{
              backgroundColor: 'white',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div
                style={{
                  fontSize: '32px',
                  width: '56px',
                  height: '56px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#F0FDFA',
                  borderRadius: '8px',
                }}
              >
                {template.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    backgroundColor: '#F0FDFA',
                    color: '#0F766E',
                    borderRadius: '12px',
                    fontSize: '12px',
                    marginBottom: '8px',
                  }}
                >
                  {template.category}
                </div>
                <h3 style={{ color: '#12332B', marginBottom: '8px' }}>{template.name}</h3>
                <p style={{ color: '#666', fontSize: '14px' }}>{template.description}</p>
              </div>
            </div>

            <button
              onClick={() => handleRunTemplate(template)}
              style={{
                backgroundColor: '#0F766E',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: 'auto',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#0D6259';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#0F766E';
              }}
            >
              <Play size={16} />
              Run Report
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}