import type { WorkspaceView } from './dashboard-navigation';
import './workspace-pages.css';

export const builtInSections: WorkspaceView[] = ['Asistente', 'Citas', 'Pacientes', 'Profesionales', 'Servicios', 'Tratamientos', 'Seguimiento', 'Horarios'];
type Section = { id: WorkspaceView; title: string; visible: boolean };
type Block = { type: 'heading' | 'text'; text: string };
export type CustomPage = { id: string; title: string; visible: boolean; blocks: Block[] };
/** Navigation and pages saved per business in Clinic.workspacePages; the CRM still renders existing values. */
export type WorkspacePages = { sections: Section[]; pages: CustomPage[] };

export function CustomPageContent({ page }: { page: CustomPage }) {
  return <article className="panel custom-page-content"><h1>{page.title}</h1>
    {page.blocks.map((block, index) => block.type === 'heading' ? <h2 key={index}>{block.text}</h2> : <p key={index}>{block.text}</p>)}
  </article>;
}
