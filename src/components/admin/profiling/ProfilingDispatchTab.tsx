import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Archive, RotateCcw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { useUser } from '../../../hooks/useUser';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { SidePanel } from '../../common/SidePanel';
import { NeuronModal } from '../../ui/NeuronModal';

type DispatchPerson = { id: string; name: string; type: 'driver' | 'helper'; phone: string | null; license_number: string | null; is_active: boolean };
type Vehicle = { id: string; plate_number: string; vehicle_type: string | null; capacity: string | null; is_active: boolean };
type SubTab = 'people' | 'vehicles';

const EMPTY_PERSON = { name: '', type: 'driver' as 'driver' | 'helper', phone: '', license_number: '' };
const EMPTY_VEHICLE = { plate_number: '', vehicle_type: '', capacity: '' };
const INPUT: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #E5E9F0', borderRadius: 8, fontSize: 13, color: '#12332B', background: '#FFFFFF', outline: 'none' };
const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#12332B', marginBottom: 6, display: 'block' };

export function ProfilingDispatchTab({ initialQuery = '' }: { initialQuery?: string }) {
  const { user } = useUser();
  const [subTab, setSubTab] = useState<SubTab>('people');
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
  const [archiveTarget, setArchiveTarget] = useState<{ type: 'person' | 'vehicle'; item: DispatchPerson | Vehicle } | null>(null);

  const loadPeople = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('dispatch_people').select('*').order('name');
    if (!showInactive) q = q.eq('is_active', true);
    const { data } = await q;
    setPeople(data ?? []);
    setLoading(false);
  }, [showInactive]);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('vehicles').select('*').order('plate_number');
    if (!showInactive) q = q.eq('is_active', true);
    const { data } = await q;
    setVehicles(data ?? []);
    setLoading(false);
  }, [showInactive]);

  useEffect(() => { if (subTab === 'people') loadPeople(); else loadVehicles(); }, [subTab, loadPeople, loadVehicles]);

  // ---- People CRUD ----
  async function savePerson() {
    if (!personForm.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const payload = { name: personForm.name.trim(), type: personForm.type, phone: personForm.phone.trim() || null, license_number: personForm.license_number.trim() || null, updated_by: user?.id ?? null };
    let error: unknown;
    if (editPerson) {
      ({ error } = await supabase.from('dispatch_people').update(payload).eq('id', editPerson.id));
    } else {
      ({ error } = await supabase.from('dispatch_people').insert({ ...payload, created_by: user?.id ?? null }));
    }
    setSaving(false);
    if (error) { toast.error('Save failed'); return; }
    toast.success(editPerson ? 'Updated' : 'Created');
    setPersonPanel(false);
    loadPeople();
  }

  async function saveVehicle() {
    if (!vehicleForm.plate_number.trim()) { toast.error('Plate number is required'); return; }
    setSaving(true);
    const payload = { plate_number: vehicleForm.plate_number.trim().toUpperCase(), vehicle_type: vehicleForm.vehicle_type.trim() || null, capacity: vehicleForm.capacity.trim() || null, updated_by: user?.id ?? null };
    let error: unknown;
    if (editVehicle) {
      ({ error } = await supabase.from('vehicles').update(payload).eq('id', editVehicle.id));
    } else {
      ({ error } = await supabase.from('vehicles').insert({ ...payload, created_by: user?.id ?? null }));
    }
    setSaving(false);
    if (error) { toast.error('Save failed'); return; }
    toast.success(editVehicle ? 'Updated' : 'Created');
    setVehiclePanel(false);
    loadVehicles();
  }

  async function handleArchive(activate: boolean) {
    if (!archiveTarget) return;
    const table = archiveTarget.type === 'person' ? 'dispatch_people' : 'vehicles';
    const { error } = await supabase.from(table).update({ is_active: activate, updated_by: user?.id ?? null }).eq('id', archiveTarget.item.id);
    if (error) { toast.error('Failed'); return; }
    toast.success(activate ? 'Reactivated' : 'Archived');
    setArchiveTarget(null);
    if (archiveTarget.type === 'person') loadPeople(); else loadVehicles();
  }

  const filteredPeople = people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const filteredVehicles = vehicles.filter(v => v.plate_number.toLowerCase().includes(search.toLowerCase()) || (v.vehicle_type ?? '').toLowerCase().includes(search.toLowerCase()));

  const peopleColumns: ColumnDef<DispatchPerson>[] = [
    { header: 'Name', cell: r => <span style={{ fontWeight: 500, color: '#12332B' }}>{r.name}</span> },
    { header: 'Type', cell: r => <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: r.type === 'driver' ? '#EFF6FF' : '#F5F3FF', color: r.type === 'driver' ? '#3B82F6' : '#7C3AED', textTransform: 'capitalize' }}>{r.type}</span> },
    { header: 'Phone', cell: r => <span style={{ color: '#667085', fontSize: 13 }}>{r.phone ?? '—'}</span> },
    { header: 'License', cell: r => <span style={{ color: '#667085', fontSize: 13 }}>{r.license_number ?? '—'}</span> },
    { header: 'Status', cell: r => <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: r.is_active ? '#F0FDF4' : '#FEF2F2', color: r.is_active ? '#0F766E' : '#DC2626' }}>{r.is_active ? 'Active' : 'Archived'}</span> },
    {
      header: '', cell: r => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={e => { e.stopPropagation(); setEditPerson(r); setPersonForm({ name: r.name, type: r.type, phone: r.phone ?? '', license_number: r.license_number ?? '' }); setPersonPanel(true); }} style={actionBtn}>Edit</button>
          {r.is_active
            ? <button onClick={e => { e.stopPropagation(); setArchiveTarget({ type: 'person', item: r }); }} style={{ ...actionBtn, color: '#DC2626' }}><Archive size={13} /></button>
            : <button onClick={e => { e.stopPropagation(); setArchiveTarget(null); supabase.from('dispatch_people').update({ is_active: true }).eq('id', r.id).then(() => { toast.success('Reactivated'); loadPeople(); }); }} style={{ ...actionBtn, color: '#0F766E' }}><RotateCcw size={13} /></button>
          }
        </div>
      ),
    },
  ];

  const vehicleColumns: ColumnDef<Vehicle>[] = [
    { header: 'Plate Number', cell: r => <span style={{ fontWeight: 600, color: '#12332B', fontFamily: 'monospace' }}>{r.plate_number}</span> },
    { header: 'Type', cell: r => <span style={{ color: '#667085', fontSize: 13 }}>{r.vehicle_type ?? '—'}</span> },
    { header: 'Capacity', cell: r => <span style={{ color: '#667085', fontSize: 13 }}>{r.capacity ?? '—'}</span> },
    { header: 'Status', cell: r => <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: r.is_active ? '#F0FDF4' : '#FEF2F2', color: r.is_active ? '#0F766E' : '#DC2626' }}>{r.is_active ? 'Active' : 'Archived'}</span> },
    {
      header: '', cell: r => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={e => { e.stopPropagation(); setEditVehicle(r); setVehicleForm({ plate_number: r.plate_number, vehicle_type: r.vehicle_type ?? '', capacity: r.capacity ?? '' }); setVehiclePanel(true); }} style={actionBtn}>Edit</button>
          {r.is_active
            ? <button onClick={e => { e.stopPropagation(); setArchiveTarget({ type: 'vehicle', item: r }); }} style={{ ...actionBtn, color: '#DC2626' }}><Archive size={13} /></button>
            : <button onClick={e => { e.stopPropagation(); supabase.from('vehicles').update({ is_active: true }).eq('id', r.id).then(() => { toast.success('Reactivated'); loadVehicles(); }); }} style={{ ...actionBtn, color: '#0F766E' }}><RotateCcw size={13} /></button>
          }
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Sub-tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['people', 'vehicles'] as SubTab[]).map(t => (
          <button key={t} onClick={() => { setSubTab(t); setSearch(''); }} style={{
            padding: '5px 14px', borderRadius: 20, border: '1px solid', fontSize: 13, cursor: 'pointer', fontWeight: subTab === t ? 500 : 400,
            background: subTab === t ? '#0F766E' : '#FFFFFF',
            borderColor: subTab === t ? '#0F766E' : '#E5E9F0',
            color: subTab === t ? '#FFFFFF' : '#667085',
          }}>
            {t === 'people' ? 'Drivers & Helpers' : 'Vehicles'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#667085' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${subTab === 'people' ? 'drivers & helpers' : 'vehicles'}…`} style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#667085', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show archived
        </label>
        {subTab === 'people' && (
          <button onClick={() => { setEditPerson(null); setPersonForm(EMPTY_PERSON); setPersonPanel(true); }} style={primaryBtn}><Plus size={14} /> New Person</button>
        )}
        {subTab === 'vehicles' && (
          <button onClick={() => { setEditVehicle(null); setVehicleForm(EMPTY_VEHICLE); setVehiclePanel(true); }} style={primaryBtn}><Plus size={14} /> New Vehicle</button>
        )}
      </div>

      {subTab === 'people' && <DataTable data={filteredPeople} columns={peopleColumns} isLoading={loading} emptyMessage="No drivers or helpers found." />}
      {subTab === 'vehicles' && <DataTable data={filteredVehicles} columns={vehicleColumns} isLoading={loading} emptyMessage="No vehicles found." />}

      {/* Person panel */}
      <SidePanel isOpen={personPanel} onClose={() => setPersonPanel(false)} title={editPerson ? 'Edit Person' : 'New Driver / Helper'}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button onClick={() => setPersonPanel(false)} style={cancelBtn}>Cancel</button><button onClick={savePerson} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : editPerson ? 'Save Changes' : 'Create'}</button></div>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
          <div><label style={LABEL}>Type</label><select value={personForm.type} onChange={e => setPersonForm(f => ({ ...f, type: e.target.value as 'driver' | 'helper' }))} style={INPUT}><option value="driver">Driver</option><option value="helper">Helper</option></select></div>
          <div><label style={LABEL}>Name <span style={{ color: '#DC2626' }}>*</span></label><input value={personForm.name} onChange={e => setPersonForm(f => ({ ...f, name: e.target.value }))} style={INPUT} placeholder="Full name" /></div>
          <div><label style={LABEL}>Phone</label><input value={personForm.phone} onChange={e => setPersonForm(f => ({ ...f, phone: e.target.value }))} style={INPUT} placeholder="+63 9XX XXX XXXX" /></div>
          <div><label style={LABEL}>License Number</label><input value={personForm.license_number} onChange={e => setPersonForm(f => ({ ...f, license_number: e.target.value }))} style={INPUT} placeholder="Driver's license number" /></div>
        </div>
      </SidePanel>

      {/* Vehicle panel */}
      <SidePanel isOpen={vehiclePanel} onClose={() => setVehiclePanel(false)} title={editVehicle ? 'Edit Vehicle' : 'New Vehicle'}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button onClick={() => setVehiclePanel(false)} style={cancelBtn}>Cancel</button><button onClick={saveVehicle} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : editVehicle ? 'Save Changes' : 'Create'}</button></div>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
          <div><label style={LABEL}>Plate Number <span style={{ color: '#DC2626' }}>*</span></label><input value={vehicleForm.plate_number} onChange={e => setVehicleForm(f => ({ ...f, plate_number: e.target.value.toUpperCase() }))} style={INPUT} placeholder="e.g. ABC 1234" /></div>
          <div><label style={LABEL}>Vehicle Type</label><input value={vehicleForm.vehicle_type} onChange={e => setVehicleForm(f => ({ ...f, vehicle_type: e.target.value }))} style={INPUT} placeholder="e.g. 10-Wheeler, Closed Van" /></div>
          <div><label style={LABEL}>Capacity</label><input value={vehicleForm.capacity} onChange={e => setVehicleForm(f => ({ ...f, capacity: e.target.value }))} style={INPUT} placeholder="e.g. 10 tons" /></div>
        </div>
      </SidePanel>

      <NeuronModal isOpen={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive Record"
        message={`Archive this record? It will no longer appear in booking lookups.`}
        confirmLabel="Archive" confirmVariant="danger"
        onConfirm={() => handleArchive(false)}
      />
    </div>
  );
}

const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#0F766E', color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const cancelBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E9F0', background: '#FFFFFF', color: '#12332B', fontSize: 13, cursor: 'pointer' };
const actionBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E9F0', background: '#FFFFFF', color: '#667085', fontSize: 12, cursor: 'pointer' };
