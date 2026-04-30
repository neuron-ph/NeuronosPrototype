import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Archive, RotateCcw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { useUser } from '../../../hooks/useUser';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { SidePanel } from '../../common/SidePanel';
import { NeuronModal } from '../../ui/NeuronModal';

type DispatchPerson = {
  id: string;
  name: string;
  type: 'driver' | 'helper';
  phone: string | null;
  license_number: string | null;
  is_active: boolean;
};

type Vehicle = {
  id: string;
  plate_number: string;
  vehicle_type: string | null;
  capacity: string | null;
  is_active: boolean;
};

type SubTab = 'people' | 'vehicles';

const EMPTY_PERSON = {
  name: '',
  type: 'driver' as 'driver' | 'helper',
  phone: '',
  license_number: '',
};

const EMPTY_VEHICLE = { plate_number: '', vehicle_type: '', capacity: '' };

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #E5E9F0',
  borderRadius: 8,
  fontSize: 13,
  color: '#12332B',
  background: '#FFFFFF',
  outline: 'none',
};

const LABEL: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#12332B',
  marginBottom: 6,
  display: 'block',
};

export function ProfilingDispatchTab({
  initialQuery = '',
  initialSubTab = 'people',
  lockedSubTab,
}: {
  initialQuery?: string;
  initialSubTab?: SubTab;
  lockedSubTab?: SubTab;
}) {
  const { user } = useUser();
  const [subTab, setSubTab] = useState<SubTab>(initialSubTab);
  const [people, setPeople] = useState<DispatchPerson[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);
  const [showInactive, setShowInactive] = useState(false);
  const [personPanel, setPersonPanel] = useState(false);
  const [vehiclePanel, setVehiclePanel] = useState(false);
  const [editPerson, setEditPerson] = useState<DispatchPerson | null>(null);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [personForm, setPersonForm] = useState(EMPTY_PERSON);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{
    type: 'person' | 'vehicle';
    item: DispatchPerson | Vehicle;
  } | null>(null);

  const activeSubTab = lockedSubTab ?? subTab;

  useEffect(() => {
    setSearch(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (lockedSubTab) {
      setSubTab(lockedSubTab);
      return;
    }
    setSubTab(initialSubTab);
  }, [initialSubTab, lockedSubTab]);

  const loadPeople = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('dispatch_people').select('*').order('name');
    if (!showInactive) query = query.eq('is_active', true);
    const { data } = await query;
    setPeople(data ?? []);
    setLoading(false);
  }, [showInactive]);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('vehicles').select('*').order('plate_number');
    if (!showInactive) query = query.eq('is_active', true);
    const { data } = await query;
    setVehicles(data ?? []);
    setLoading(false);
  }, [showInactive]);

  useEffect(() => {
    if (activeSubTab === 'people') loadPeople();
    else loadVehicles();
  }, [activeSubTab, loadPeople, loadVehicles]);

  async function savePerson() {
    if (!personForm.name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    const payload = {
      name: personForm.name.trim(),
      type: personForm.type,
      phone: personForm.phone.trim() || null,
      license_number: personForm.license_number.trim() || null,
      updated_by: user?.id ?? null,
    };

    let error: unknown;
    if (editPerson) {
      ({ error } = await supabase.from('dispatch_people').update(payload).eq('id', editPerson.id));
    } else {
      ({ error } = await supabase.from('dispatch_people').insert({
        ...payload,
        created_by: user?.id ?? null,
      }));
    }

    setSaving(false);
    if (error) {
      toast.error('Save failed');
      return;
    }

    toast.success(editPerson ? 'Updated' : 'Created');
    setPersonPanel(false);
    loadPeople();
  }

  async function saveVehicle() {
    if (!vehicleForm.plate_number.trim()) {
      toast.error('Plate number is required');
      return;
    }

    setSaving(true);
    const payload = {
      plate_number: vehicleForm.plate_number.trim().toUpperCase(),
      vehicle_type: vehicleForm.vehicle_type.trim() || null,
      capacity: vehicleForm.capacity.trim() || null,
      updated_by: user?.id ?? null,
    };

    let error: unknown;
    if (editVehicle) {
      ({ error } = await supabase.from('vehicles').update(payload).eq('id', editVehicle.id));
    } else {
      ({ error } = await supabase.from('vehicles').insert({
        ...payload,
        created_by: user?.id ?? null,
      }));
    }

    setSaving(false);
    if (error) {
      toast.error('Save failed');
      return;
    }

    toast.success(editVehicle ? 'Updated' : 'Created');
    setVehiclePanel(false);
    loadVehicles();
  }

  async function handleArchive(activate: boolean) {
    if (!archiveTarget) return;

    const table = archiveTarget.type === 'person' ? 'dispatch_people' : 'vehicles';
    const { error } = await supabase
      .from(table)
      .update({ is_active: activate, updated_by: user?.id ?? null })
      .eq('id', archiveTarget.item.id);

    if (error) {
      toast.error('Failed');
      return;
    }

    toast.success(activate ? 'Reactivated' : 'Archived');
    setArchiveTarget(null);
    if (archiveTarget.type === 'person') loadPeople();
    else loadVehicles();
  }

  const filteredPeople = people.filter(person =>
    person.name.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredVehicles = vehicles.filter(
    vehicle =>
      vehicle.plate_number.toLowerCase().includes(search.toLowerCase()) ||
      (vehicle.vehicle_type ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const peopleColumns: ColumnDef<DispatchPerson>[] = [
    {
      header: 'Name',
      cell: row => <span style={{ fontWeight: 500, color: '#12332B' }}>{row.name}</span>,
    },
    {
      header: 'Type',
      cell: row => (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: 4,
            background: row.type === 'driver' ? '#EFF6FF' : '#F5F3FF',
            color: row.type === 'driver' ? '#3B82F6' : '#7C3AED',
            textTransform: 'capitalize',
          }}
        >
          {row.type}
        </span>
      ),
    },
    {
      header: 'Phone',
      cell: row => <span style={{ color: '#667085', fontSize: 13 }}>{row.phone ?? '—'}</span>,
    },
    {
      header: 'License',
      cell: row => (
        <span style={{ color: '#667085', fontSize: 13 }}>{row.license_number ?? '—'}</span>
      ),
    },
    {
      header: 'Status',
      cell: row => (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: 4,
            background: row.is_active ? '#F0FDF4' : '#FEF2F2',
            color: row.is_active ? '#0F766E' : '#DC2626',
          }}
        >
          {row.is_active ? 'Active' : 'Archived'}
        </span>
      ),
    },
    {
      header: '',
      cell: row => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            onClick={event => {
              event.stopPropagation();
              setEditPerson(row);
              setPersonForm({
                name: row.name,
                type: row.type,
                phone: row.phone ?? '',
                license_number: row.license_number ?? '',
              });
              setPersonPanel(true);
            }}
            style={actionBtn}
          >
            Edit
          </button>
          {row.is_active ? (
            <button
              onClick={event => {
                event.stopPropagation();
                setArchiveTarget({ type: 'person', item: row });
              }}
              style={{ ...actionBtn, color: '#DC2626' }}
            >
              <Archive size={13} />
            </button>
          ) : (
            <button
              onClick={event => {
                event.stopPropagation();
                setArchiveTarget(null);
                supabase
                  .from('dispatch_people')
                  .update({ is_active: true })
                  .eq('id', row.id)
                  .then(() => {
                    toast.success('Reactivated');
                    loadPeople();
                  });
              }}
              style={{ ...actionBtn, color: '#0F766E' }}
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const vehicleColumns: ColumnDef<Vehicle>[] = [
    {
      header: 'Plate Number',
      cell: row => (
        <span style={{ fontWeight: 600, color: '#12332B', fontFamily: 'monospace' }}>
          {row.plate_number}
        </span>
      ),
    },
    {
      header: 'Type',
      cell: row => <span style={{ color: '#667085', fontSize: 13 }}>{row.vehicle_type ?? '—'}</span>,
    },
    {
      header: 'Capacity',
      cell: row => <span style={{ color: '#667085', fontSize: 13 }}>{row.capacity ?? '—'}</span>,
    },
    {
      header: 'Status',
      cell: row => (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: 4,
            background: row.is_active ? '#F0FDF4' : '#FEF2F2',
            color: row.is_active ? '#0F766E' : '#DC2626',
          }}
        >
          {row.is_active ? 'Active' : 'Archived'}
        </span>
      ),
    },
    {
      header: '',
      cell: row => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            onClick={event => {
              event.stopPropagation();
              setEditVehicle(row);
              setVehicleForm({
                plate_number: row.plate_number,
                vehicle_type: row.vehicle_type ?? '',
                capacity: row.capacity ?? '',
              });
              setVehiclePanel(true);
            }}
            style={actionBtn}
          >
            Edit
          </button>
          {row.is_active ? (
            <button
              onClick={event => {
                event.stopPropagation();
                setArchiveTarget({ type: 'vehicle', item: row });
              }}
              style={{ ...actionBtn, color: '#DC2626' }}
            >
              <Archive size={13} />
            </button>
          ) : (
            <button
              onClick={event => {
                event.stopPropagation();
                supabase
                  .from('vehicles')
                  .update({ is_active: true })
                  .eq('id', row.id)
                  .then(() => {
                    toast.success('Reactivated');
                    loadVehicles();
                  });
              }}
              style={{ ...actionBtn, color: '#0F766E' }}
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      {!lockedSubTab && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['people', 'vehicles'] as SubTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => {
                setSubTab(tab);
                setSearch('');
              }}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                border: '1px solid',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: activeSubTab === tab ? 500 : 400,
                background: activeSubTab === tab ? '#0F766E' : '#FFFFFF',
                borderColor: activeSubTab === tab ? '#0F766E' : '#E5E9F0',
                color: activeSubTab === tab ? '#FFFFFF' : '#667085',
              }}
            >
              {tab === 'people' ? 'Drivers & Helpers' : 'Vehicles'}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#667085',
            }}
          />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={`Search ${activeSubTab === 'people' ? 'drivers & helpers' : 'vehicles'}...`}
            style={{ ...INPUT, paddingLeft: 32 }}
          />
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: '#667085',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={showInactive}
            onChange={event => setShowInactive(event.target.checked)}
          />
          Show archived
        </label>
        {activeSubTab === 'people' && (
          <button
            onClick={() => {
              setEditPerson(null);
              setPersonForm(EMPTY_PERSON);
              setPersonPanel(true);
            }}
            style={primaryBtn}
          >
            <Plus size={14} /> New Person
          </button>
        )}
        {activeSubTab === 'vehicles' && (
          <button
            onClick={() => {
              setEditVehicle(null);
              setVehicleForm(EMPTY_VEHICLE);
              setVehiclePanel(true);
            }}
            style={primaryBtn}
          >
            <Plus size={14} /> New Vehicle
          </button>
        )}
      </div>

      {activeSubTab === 'people' && (
        <DataTable
          data={filteredPeople}
          columns={peopleColumns}
          isLoading={loading}
          emptyMessage="No drivers or helpers found."
        />
      )}
      {activeSubTab === 'vehicles' && (
        <DataTable
          data={filteredVehicles}
          columns={vehicleColumns}
          isLoading={loading}
          emptyMessage="No vehicles found."
        />
      )}

      <SidePanel
        isOpen={personPanel}
        onClose={() => setPersonPanel(false)}
        title={editPerson ? 'Edit Person' : 'New Driver / Helper'}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setPersonPanel(false)} style={cancelBtn}>
              Cancel
            </button>
            <button onClick={savePerson} disabled={saving} style={primaryBtn}>
              {saving ? 'Saving...' : editPerson ? 'Save Changes' : 'Create'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
          <div>
            <label style={LABEL}>Type</label>
            <select
              value={personForm.type}
              onChange={event =>
                setPersonForm(form => ({
                  ...form,
                  type: event.target.value as 'driver' | 'helper',
                }))
              }
              style={INPUT}
            >
              <option value="driver">Driver</option>
              <option value="helper">Helper</option>
            </select>
          </div>
          <div>
            <label style={LABEL}>
              Name <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              value={personForm.name}
              onChange={event => setPersonForm(form => ({ ...form, name: event.target.value }))}
              style={INPUT}
              placeholder="Full name"
            />
          </div>
          <div>
            <label style={LABEL}>Phone</label>
            <input
              value={personForm.phone}
              onChange={event => setPersonForm(form => ({ ...form, phone: event.target.value }))}
              style={INPUT}
              placeholder="+63 9XX XXX XXXX"
            />
          </div>
          <div>
            <label style={LABEL}>License Number</label>
            <input
              value={personForm.license_number}
              onChange={event =>
                setPersonForm(form => ({ ...form, license_number: event.target.value }))
              }
              style={INPUT}
              placeholder="Driver's license number"
            />
          </div>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={vehiclePanel}
        onClose={() => setVehiclePanel(false)}
        title={editVehicle ? 'Edit Vehicle' : 'New Vehicle'}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setVehiclePanel(false)} style={cancelBtn}>
              Cancel
            </button>
            <button onClick={saveVehicle} disabled={saving} style={primaryBtn}>
              {saving ? 'Saving...' : editVehicle ? 'Save Changes' : 'Create'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
          <div>
            <label style={LABEL}>
              Plate Number <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              value={vehicleForm.plate_number}
              onChange={event =>
                setVehicleForm(form => ({ ...form, plate_number: event.target.value.toUpperCase() }))
              }
              style={INPUT}
              placeholder="e.g. ABC 1234"
            />
          </div>
          <div>
            <label style={LABEL}>Vehicle Type</label>
            <input
              value={vehicleForm.vehicle_type}
              onChange={event =>
                setVehicleForm(form => ({ ...form, vehicle_type: event.target.value }))
              }
              style={INPUT}
              placeholder="e.g. 10-Wheeler, Closed Van"
            />
          </div>
          <div>
            <label style={LABEL}>Capacity</label>
            <input
              value={vehicleForm.capacity}
              onChange={event => setVehicleForm(form => ({ ...form, capacity: event.target.value }))}
              style={INPUT}
              placeholder="e.g. 10 tons"
            />
          </div>
        </div>
      </SidePanel>

      <NeuronModal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="Archive Record"
        message="Archive this record? It will no longer appear in booking lookups."
        confirmLabel="Archive"
        confirmVariant="danger"
        onConfirm={() => handleArchive(false)}
      />
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 14px',
  borderRadius: 8,
  border: 'none',
  background: '#0F766E',
  color: '#FFFFFF',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const cancelBtn: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 8,
  border: '1px solid #E5E9F0',
  background: '#FFFFFF',
  color: '#12332B',
  fontSize: 13,
  cursor: 'pointer',
};

const actionBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #E5E9F0',
  background: '#FFFFFF',
  color: '#667085',
  fontSize: 12,
  cursor: 'pointer',
};
