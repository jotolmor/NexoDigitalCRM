import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { registrationSectors } from './registration-sectors';
import type { WorkspaceView } from './dashboard-navigation';
import './platform-pages.css';

export const builtInSections: WorkspaceView[] = ['Asistente', 'Citas', 'Pacientes', 'Profesionales', 'Servicios', 'Tratamientos', 'Seguimiento', 'Horarios'];
type Section = { id: WorkspaceView; title: string; visible: boolean };
type Block = { type: 'heading' | 'text'; text: string };
export type CustomPage = { id: string; title: string; visible: boolean; blocks: Block[] };
export type WorkspacePages = { sections: Section[]; pages: CustomPage[] };
type Business = { id: string; name: string; businessType: string; workspacePages: WorkspacePages | null };
type Request = (path: string, body?: unknown, method?: 'PATCH') => Promise<any>;

const endpoint = '/platform/businesses';

function move<T>(items: T[], index: number, offset: number) {
  const next = [...items];
  [next[index], next[index + offset]] = [next[index + offset], next[index]];
  return next;
}

function Reorder({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
  return <div className="platform-actions">
    <button type="button" disabled={index === 0} onClick={() => onMove(-1)}>Subir</button>
    <button type="button" disabled={index === total - 1} onClick={() => onMove(1)}>Bajar</button>
  </div>;
}

function WorkspaceEditor({ business, request }: { business: Business; request: Request }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<WorkspacePages>(() => {
    const configured = business.workspacePages?.sections ?? [];
    const available = builtInSections.filter(id => business.businessType !== 'AUTOMOTIVE' || !['Asistente', 'Citas'].includes(id));
    return {
      sections: [...configured.filter(section => available.includes(section.id)),
        ...available.filter(id => !configured.some(section => section.id === id)).map(id => ({ id, title: '', visible: true }))],
      pages: business.workspacePages?.pages ?? [],
    };
  });
  const save = useMutation({
    mutationFn: () => request(endpoint + '/' + encodeURIComponent(business.id) + '/pages', draft, 'PATCH'),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['platform-businesses'] }), qc.invalidateQueries({ queryKey: ['clinic'] })]),
  });
  const setPages = (pages: CustomPage[]) => setDraft(current => ({ ...current, pages }));
  const updatePage = (id: string, changes: Partial<CustomPage>) => setPages(draft.pages.map(page => page.id === id ? { ...page, ...changes } : page));

  return <form className="panel platform-form" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
    <h2>Páginas de {business.name}</h2>
    <fieldset disabled={save.isPending}>
      <legend>Secciones del CRM</legend>
      {draft.sections.map((section, index) => <div className="platform-row" key={section.id}>
        <label>{section.id}<input maxLength={60} placeholder="Nombre del sector" value={section.title} onChange={event => {
          const title = event.target.value;
          setDraft(current => ({ ...current, sections: current.sections.map(item => item.id === section.id ? { ...item, title } : item) }));
        }} /></label>
        <label><input type="checkbox" checked={section.visible} onChange={event => {
          const visible = event.target.checked;
          setDraft(current => ({ ...current, sections: current.sections.map(item => item.id === section.id ? { ...item, visible } : item) }));
        }} /> Visible</label>
        <Reorder index={index} total={draft.sections.length} onMove={offset => setDraft(current => ({ ...current, sections: move(current.sections, index, offset) }))} />
      </div>)}
    </fieldset>
    <fieldset disabled={save.isPending}>
      <legend>Páginas personalizadas</legend>
      {draft.pages.map((page, index) => <fieldset key={page.id}>
        <legend>{page.title.trim() || 'Nueva página'}</legend>
        <div className="platform-row">
          <label>Título<input required maxLength={60} value={page.title} onChange={event => updatePage(page.id, { title: event.target.value })} /></label>
          <label><input type="checkbox" checked={page.visible} onChange={event => updatePage(page.id, { visible: event.target.checked })} /> Visible</label>
          <Reorder index={index} total={draft.pages.length} onMove={offset => setPages(move(draft.pages, index, offset))} />
          <button type="button" onClick={() => setPages(draft.pages.filter(item => item.id !== page.id))}>Quitar página</button>
        </div>
        {page.blocks.map((block, blockIndex) => <div className="platform-row" key={blockIndex}>
          <label>{block.type === 'heading' ? 'Encabezado' : 'Texto'}
            <textarea maxLength={5000} value={block.text} onChange={event => updatePage(page.id, { blocks: page.blocks.map((item, position) => position === blockIndex ? { ...item, text: event.target.value } : item) })} />
          </label>
          <Reorder index={blockIndex} total={page.blocks.length} onMove={offset => updatePage(page.id, { blocks: move(page.blocks, blockIndex, offset) })} />
          <button type="button" onClick={() => updatePage(page.id, { blocks: page.blocks.filter((_, position) => position !== blockIndex) })}>Quitar bloque</button>
        </div>)}
        <div className="platform-actions">
          <button type="button" disabled={page.blocks.length >= 20} onClick={() => updatePage(page.id, { blocks: [...page.blocks, { type: 'heading', text: '' }] })}>Añadir encabezado</button>
          <button type="button" disabled={page.blocks.length >= 20} onClick={() => updatePage(page.id, { blocks: [...page.blocks, { type: 'text', text: '' }] })}>Añadir texto</button>
        </div>
      </fieldset>)}
      <button type="button" disabled={draft.pages.length >= 20} onClick={() => setPages([...draft.pages, { id: crypto.randomUUID(), title: '', visible: true, blocks: [] }])}>Añadir página</button>
    </fieldset>
    <button className="primary" disabled={save.isPending}>Guardar páginas</button>
    {save.isSuccess && <p role="status">Páginas guardadas.</p>}
    {save.error && <p className="error" role="alert">{save.error.message}</p>}
  </form>;
}

export function PlatformPanel({ request, development = false }: { request: Request; development?: boolean }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState('');
  const businesses = useQuery<Business[]>({ queryKey: ['platform-businesses'], queryFn: () => request(endpoint) });
  const create = useMutation({
    mutationFn: async (data: Record<string, FormDataEntryValue>) => {
      if (!development) return request(endpoint, data);
      const session = await request('/development/businesses', {
        name: data.clinicName, businessType: data.businessType, specialty: data.specialty, address: data.address,
      });
      return { id: session.user.clinicId };
    },
    onSuccess: async (business: Business) => {
      await qc.invalidateQueries({ queryKey: ['platform-businesses'] });
      setSelected(business.id);
    },
  });
  function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    create.mutate(Object.fromEntries(new FormData(form)), { onSuccess: () => form.reset() });
  }
  const business = businesses.data?.find(item => item.id === selected);

  return <section className="platform-panel">
    <form className="panel platform-form" onSubmit={createBusiness}>
      <h2>Crear negocio</h2>
      <fieldset disabled={create.isPending} className="platform-row">
        <legend>{development ? 'Datos del negocio de desarrollo' : 'Negocio y cuenta propietaria'}</legend>
        <label>Nombre del negocio<input name="clinicName" required minLength={2} maxLength={120} /></label>
        <label>Sector<select name="businessType">{registrationSectors.map(sector => <option key={sector.value} value={sector.value}>{sector.label}</option>)}</select></label>
        <label>Actividad<input name="specialty" required maxLength={150} /></label>
        <label>Dirección<input name="address" maxLength={300} /></label>
        {!development && <><label>Nombre del propietario<input name="name" required minLength={2} maxLength={120} /></label>
        <label>Correo del propietario<input name="email" required type="email" /></label>
        <label>Contraseña inicial<input name="password" required type="password" minLength={12} autoComplete="new-password" /></label></>}
      </fieldset>
      <button className="primary" disabled={create.isPending}>Crear negocio</button>
      {create.error && <p className="error" role="alert">{create.error.message}</p>}
      {create.isSuccess && <p role="status">Negocio creado.</p>}
    </form>
    <div className="panel">
      <label>Negocio a configurar<select value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">Seleccionar negocio</option>
        {businesses.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      {businesses.isPending && <p role="status">Cargando negocios…</p>}
      {businesses.error && <p className="error" role="alert">{businesses.error.message}</p>}
    </div>
    {business && <WorkspaceEditor key={business.id} business={business} request={request} />}
  </section>;
}

export function CustomPageContent({ page }: { page: CustomPage }) {
  return <article className="panel platform-content"><h1>{page.title}</h1>
    {page.blocks.map((block, index) => block.type === 'heading' ? <h2 key={index}>{block.text}</h2> : <p key={index}>{block.text}</p>)}
  </article>;
}
