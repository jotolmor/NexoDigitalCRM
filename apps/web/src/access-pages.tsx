import { FormEvent, ReactNode, useState } from 'react';

export type Session = {
  accessToken: string;
  user: { id: string; name: string; tenantId: string; clinicId?: string | null };
};
type Props = { onSession: (session: Session) => void };
const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

async function authenticate(endpoint: 'login' | 'register', body: Record<string, string>): Promise<Session> {
  const response = await fetch(`${api}/auth/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? 'No se pudo completar la solicitud. Inténtalo de nuevo.');
  }
  if (!data?.accessToken || !data?.user?.id) throw new Error('La respuesta de acceso no es válida. Inténtalo de nuevo.');
  return data;
}

function AccessLayout({ title, intro, children, footer }: { title: string; intro: string; children: ReactNode; footer: ReactNode }) {
  return <main className="access"><section aria-labelledby="access-title">
    <div className="brand" role="img" aria-label="CrmNexodigitalAssist">
      <img className="crm-logo crm-logo-light" src="/branding/crm-nexodigital-assist-light.svg" alt="" aria-hidden="true" width="272" height="92" />
    </div>
    <h1 id="access-title">{title}</h1><p className="access-intro">{intro}</p>
    {children}<p className="access-switch">{footer}</p>
  </section></main>;
}

export function LoginPage({ onSession }: Props) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setMessage(''); setBusy(true);
    try {
      const session = await authenticate('login', { email: String(data.get('email') ?? '').trim(), password: String(data.get('password') ?? '') });
      onSession(session);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo iniciar sesión.'); }
    finally { setBusy(false); }
  }
  return <AccessLayout title="Iniciar sesión" intro="Accede a tu clínica y continúa donde lo dejaste." footer={<>¿Todavía no tienes cuenta? <a className="link" href="/registro">Crear una cuenta</a></>}>
    <form onSubmit={submit} aria-busy={busy}>
      <label>Correo electrónico<input name="email" type="email" autoComplete="username" required /></label>
      <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
      {message && <p className="error" role="alert">{message}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</button>
    </form>
  </AccessLayout>;
}

export function RegisterPage({ onSession }: Props) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const fields = ['clinicName', 'businessType', 'specialty', 'name', 'email', 'password'];
    const body = Object.fromEntries(fields.map(field => [field, field === 'password' ? String(values.get(field) ?? '') : String(values.get(field) ?? '').trim()]));
    setMessage(''); setBusy(true);
    try { onSession(await authenticate('register', body)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear la cuenta.'); }
    finally { setBusy(false); }
  }
  return <AccessLayout title="Crear una cuenta" intro="Registra tu negocio y empieza a organizar tu agenda." footer={<>¿Ya tienes una cuenta? <a className="link" href="/login">Iniciar sesión</a></>}>
    <form onSubmit={submit} aria-busy={busy}>
      <label>Nombre del negocio<input name="clinicName" autoComplete="organization" required minLength={2} /></label>
      <label>Sector<select name="businessType" defaultValue="CLINIC"><option value="CLINIC">Clínica o salud</option><option value="BEAUTY">Belleza y bienestar</option><option value="FITNESS">Fitness y deporte</option><option value="EDUCATION">Educación</option><option value="PROFESSIONAL_SERVICES">Servicios profesionales</option><option value="HOME_SERVICES">Servicios a domicilio</option><option value="AUTOMOTIVE">Taller y automoción</option><option value="OTHER">Otro negocio de servicios</option></select></label>
      <label>Especialidad o actividad<input name="specialty" required /></label>
      <label>Tu nombre<input name="name" autoComplete="name" required minLength={2} /></label>
      <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
      <label>Contraseña<input name="password" type="password" autoComplete="new-password" minLength={12} aria-describedby="registration-password-help" required /></label>
      <small id="registration-password-help" className="access-help">Utiliza al menos 12 caracteres.</small>
      {message && <p className="error" role="alert">{message}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? 'Creando cuenta…' : 'Crear cuenta'}</button>
    </form>
  </AccessLayout>;
}

export function Access({ onSession }: Props) {
  const complete = (session: Session) => { window.history.replaceState(null, '', '/'); onSession(session); };
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return path === '/registro' ? <RegisterPage onSession={complete} /> : <LoginPage onSession={complete} />;
}
