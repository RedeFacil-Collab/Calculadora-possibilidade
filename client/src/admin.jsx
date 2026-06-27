import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './admin.css';

const EVENT_LABELS = {
  login_succeeded: 'Login realizado',
  login_failed: 'Falha no login',
  commercial_matrix_read: 'Consulta à matriz',
  table_processed: 'Tabela processada',
  logout: 'Logout',
  user_created: 'Usuário criado',
  user_updated: 'Usuário atualizado',
  password_reset: 'Senha redefinida',
  login_rate_limited: 'Login bloqueado (rate limit)',
  blocked_entities_updated: 'Restrições atualizadas',
  report_exported: 'Relatório exportado',
  login_must_change_password: 'Login — troca de senha obrigatória',
  password_changed_first_login: 'Senha alterada (1º acesso)',
  users_bulk_created: 'Importação em massa',
};

const TIMEZONE = 'America/Sao_Paulo';
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: TIMEZONE }).format(new Date(value))
  : '—';

function Icon({ name }) {
  const paths = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    audit: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    calculator: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.37.28.59.7.6 1.16V10h1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v2" /></>,
    activity: <><path d="M3 12h4l2-7 4 14 2-7h6" /><circle cx="19" cy="5" r="2" /></>,
    restrictions: <><circle cx="12" cy="12" r="9" /><path d="M5.7 5.7l12.6 12.6" /></>,
    reports: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 14h6M9 18h6M9 10h1" /></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Metric({ label, value, tone = '' }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value ?? '—'}</strong></article>;
}

function AdminApp() {
  const [activeView, setActiveView] = useState('audit');
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [audit, setAudit] = useState({ rows: [], page: 1, pages: 1, total: 0 });
  const [users, setUsers] = useState([]);
  const [activity, setActivity] = useState({ users: [], summary: {}, online_window_minutes: 5 });
  const [search, setSearch] = useState('');
  const [event, setEvent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [userForm, setUserForm] = useState({ email: '', display_name: '', password: '', password_confirmation: '', role: 'operador' });
  const [savingUser, setSavingUser] = useState(false);
  const [csrfToken, setCsrfToken] = useState('');

  const csrfHeaders = (extra = {}) => ({ 'X-CSRF-Token': csrfToken, ...extra });

  const loadAudit = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page, per_page: 20 });
    if (search) params.set('search', search);
    if (event) params.set('event', event);
    try {
      const [auditResponse, summaryResponse] = await Promise.all([
        fetch(`/api/admin/audit?${params}`, { credentials: 'same-origin' }),
        fetch('/api/admin/summary', { credentials: 'same-origin' }),
      ]);
      if (!auditResponse.ok || !summaryResponse.ok) throw new Error('Não foi possível carregar a auditoria.');
      setAudit(await auditResponse.json());
      setSummary(await summaryResponse.json());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [event, search]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [sessionResponse, usersResponse, auditResponse, summaryResponse, activityResponse] = await Promise.all([
          fetch('/api/auth/session'),
          fetch('/api/admin/users'),
          fetch('/api/admin/audit?per_page=20'),
          fetch('/api/admin/summary'),
          fetch('/api/admin/activity'),
        ]);
        if (![sessionResponse, usersResponse, auditResponse, summaryResponse, activityResponse].every((response) => response.ok)) {
          throw new Error('Não foi possível carregar o painel administrativo.');
        }
        const [sessionData, usersData, auditData, summaryData, activityData] = await Promise.all([
          sessionResponse.json(),
          usersResponse.json(),
          auditResponse.json(),
          summaryResponse.json(),
          activityResponse.json(),
        ]);
        setSession(sessionData.user);
        setCsrfToken(sessionData.csrf_token || '');
        setUsers(usersData.users || []);
        setAudit(auditData);
        setSummary(summaryData);
        setActivity(activityData);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  useEffect(() => {
    if (activeView !== 'activity') return undefined;
    refreshActivity();
    const eventSource = new EventSource('/api/admin/activity/stream');
    eventSource.onmessage = () => refreshActivity();
    eventSource.onerror = () => setError('Conexão em tempo real interrompida. Reconectando…');
    return () => eventSource.close();
  }, [activeView]);

  useEffect(() => {
    const sendHeartbeat = () => fetch('/api/auth/heartbeat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrfToken },
    }).catch(() => {});
    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: csrfHeaders() });
    window.location.assign('/login');
  }

  const menu = [
    ['overview', 'Visão geral', 'overview'],
    ['activity', 'Atividade', 'activity'],
    ['audit', 'Auditoria', 'audit'],
    ['users', 'Usuários', 'users'],
    ['reports', 'Relatórios', 'reports'],
    ['restrictions', 'Restrições', 'restrictions'],
    ['calculator', 'Calculadora', 'calculator'],
    ['settings', 'Configurações', 'settings'],
  ];

  function navigate(view) {
    if (view === 'calculator') return window.location.assign('/');
    if (view === 'settings') return window.location.assign('/discounts-editor');
    setActiveView(view);
  }

  async function refreshUsers() {
    const response = await fetch('/api/admin/users', { credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os usuários.');
    setUsers(data.users || []);
  }

  async function refreshActivity() {
    setError('');
    const response = await fetch('/api/admin/activity', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Não foi possível carregar a atividade.');
      return;
    }
    setActivity(data);
  }

  async function createUser(event) {
    event.preventDefault();
    setSavingUser(true);
    setError('');
    setUserMessage('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'same-origin',
        body: JSON.stringify(userForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível criar o usuário.');
      setUserForm({ email: '', display_name: '', password: '', password_confirmation: '', role: 'operador' });
      setUserMessage('Usuário criado. Abra uma janela anônima para testar esse acesso.');
      await refreshUsers();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingUser(false);
    }
  }

  async function updateUser(userId, changes) {
    setError('');
    setUserMessage('');
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'same-origin',
        body: JSON.stringify(changes),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o usuário.');
      setUserMessage('Usuário atualizado.');
      await refreshUsers();
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    }
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="admin-brand"><span className="brand-mark" /> <span>Calculadora</span></div>
        <nav aria-label="Administração">
          {menu.map(([view, label, icon]) => (
            <button key={view} className={activeView === view ? 'active' : ''} onClick={() => navigate(view)}>
              <Icon name={icon} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot"><span>Ambiente monitorado</span><small>Controle administrativo</small></div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div><strong>Painel Administrativo</strong><span>Controle e rastreabilidade do sistema</span></div>
          <div className="admin-account"><div><strong>{session?.email || 'Administrador'}</strong><span>Administrador</span></div><button onClick={logout}>Sair</button></div>
        </header>

        <section className="admin-content">
          <div className="page-heading">
            <div>
              <h1>{activeView === 'overview' ? 'Visão geral' : activeView === 'activity' ? 'Atividade e simulações' : activeView === 'users' ? 'Usuários' : activeView === 'restrictions' ? 'Restrições' : activeView === 'reports' ? 'Relatórios' : 'Auditoria do sistema'}</h1>
              <p>{activeView === 'activity' ? `Presença em tempo real e ranking de simulações. Online = atividade nos últimos ${activity.online_window_minutes} min.` : activeView === 'users' ? 'Crie acessos e controle os perfis autorizados.' : activeView === 'restrictions' ? 'Bloqueie bancos e associações que não devem aparecer na calculadora.' : activeView === 'reports' ? 'Acompanhe a produtividade dos consultores por período.' : 'Acompanhe acessos e operações realizadas pelos usuários.'}</p>
            </div>
            {activeView === 'activity' ? <button className="refresh" onClick={refreshActivity}>Atualizar atividade</button> : activeView === 'users' ? <button className="refresh" onClick={refreshUsers}>Atualizar usuários</button> : <button className="refresh" onClick={() => loadAudit(audit.page)} disabled={loading}>Atualizar dados</button>}
          </div>

          {!['users', 'activity', 'restrictions', 'reports'].includes(activeView) ? <div className="metrics">
            <Metric label="Eventos registrados" value={summary?.total_events} />
            <Metric label="Logins realizados" value={summary?.successful_logins} tone="success" />
            <Metric label="Falhas de acesso" value={summary?.failed_logins} tone="danger" />
            <Metric label="Consultas à matriz" value={summary?.matrix_reads} tone="accent" />
          </div> : null}

          {activeView === 'activity' ? (
            <ActivityView activity={activity} error={error} />
          ) : activeView === 'users' ? (
            <UsersView
              csrfToken={csrfToken}
              currentUserId={session?.id}
              error={error}
              form={userForm}
              message={userMessage}
              onCreate={createUser}
              onFormChange={setUserForm}
              onUpdate={updateUser}
              onRefresh={refreshUsers}
              saving={savingUser}
              users={users}
            />
          ) : activeView === 'reports' ? (
            <ReportsView />
          ) : activeView === 'restrictions' ? (
            <RestrictionsView csrfToken={csrfToken} />
          ) : activeView === 'overview' ? (
            <div className="overview-grid">
              <section className="surface"><div className="surface-title"><h2>Atividade recente</h2><button onClick={() => setActiveView('audit')}>Ver auditoria</button></div><AuditTable rows={audit.rows.slice(0, 8)} compact /></section>
              <section className="surface users-summary"><div className="surface-title"><h2>Usuários ativos</h2><strong>{summary?.active_users ?? 0}</strong></div>{users.map((user) => <div className="user-line" key={user.id}><span>{user.email}</span><b>{user.role}</b></div>)}</section>
            </div>
          ) : (
            <section className="surface audit-surface">
              <div className="filters">
                <input aria-label="Pesquisar auditoria" placeholder="Pesquisar usuário, detalhes ou IP" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select aria-label="Filtrar evento" value={event} onChange={(e) => setEvent(e.target.value)}>
                  <option value="">Todos os eventos</option>
                  {(summary?.events || []).map((item) => <option key={item} value={item}>{EVENT_LABELS[item] || item}</option>)}
                </select>
                <button onClick={() => loadAudit(1)}>Aplicar filtros</button>
              </div>
              {error ? <p className="admin-error">{error}</p> : <AuditTable rows={audit.rows} loading={loading} />}
              <footer className="pagination"><span>{audit.total} eventos encontrados</span><div><button disabled={audit.page <= 1} onClick={() => loadAudit(audit.page - 1)}>Anterior</button><span>Página {audit.page} de {audit.pages}</span><button disabled={audit.page >= audit.pages} onClick={() => loadAudit(audit.page + 1)}>Próxima</button></div></footer>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

function ActivityView({ activity, error }) {
  const summary = activity.summary || {};
  return (
    <>
      <div className="metrics activity-metrics">
        <Metric label="Total de simulações" value={summary.total_processed ?? 0} tone="accent" />
        <Metric label="Simulações hoje" value={summary.processed_today ?? 0} />
        <Metric label="Usuários online" value={summary.online_users ?? 0} tone="success" />
        <Metric label="Usuários cadastrados" value={summary.total_users ?? 0} />
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      <section className="surface activity-surface">
        <div className="surface-title"><h2>Presença e simulações</h2><span className="auto-refresh">Atualização em tempo real via Redis</span></div>
        <div className="audit-table-wrap">
          <table className="audit-table activity-table">
            <thead><tr><th>Usuário</th><th>Consultor</th><th>Perfil</th><th>Presença</th><th>Última atividade</th><th>Simulações</th><th>Última simulação</th></tr></thead>
            <tbody>
              {activity.users?.length ? activity.users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>{user.display_name || '-'}</td>
                  <td>{user.role === 'admin' ? 'Administrador' : 'Operador'}</td>
                  <td><span className={`presence ${user.is_online ? 'online' : 'offline'}`}><i />{user.is_online ? 'Online' : 'Offline'}</span></td>
                  <td>{formatDate(user.last_seen_at)}</td>
                  <td><strong className="processed-count">{user.tables_processed}</strong></td>
                  <td>{formatDate(user.last_table_processed_at)}</td>
                </tr>
              )) : <tr><td colSpan="7" className="empty">Nenhum usuário cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PasswordField({ id, label, value, onChange, required = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input id={id} type={visible ? 'text' : 'password'} minLength="12" autoComplete="new-password" value={value} onChange={onChange} required={required} />
        <button type="button" onClick={() => setVisible((current) => !current)}>{visible ? 'Ocultar' : 'Mostrar'}</button>
      </div>
    </>
  );
}

function UsersView({ csrfToken, currentUserId, error, form, message, onCreate, onFormChange, onUpdate, saving, users, onRefresh }) {
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const editingUser = users.find((user) => user.id === editingUserId);

  async function resetPassword(userId) {
    if (!window.confirm('Tem certeza que deseja redefinir a senha deste usuário?')) return;
    try {
      const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível redefinir a senha.');
      setTempPassword(data.temporary_password);
    } catch (requestError) {
      window.alert(requestError.message);
    }
  }

  function startEditing(user) {
    setEditingUserId(user.id);
    setEditForm({
      email: user.email,
      display_name: user.display_name || '',
      role: user.role,
      is_active: user.is_active,
      password: '',
      password_confirmation: '',
    });
  }

  function parseBulkText(text) {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    return lines.map((line) => {
      const parts = line.split(/[;,\t]/).map((part) => part.trim());
      return {
        email: parts[0] || '',
        display_name: parts[1] || '',
        role: (parts[2] || 'operador').toLowerCase(),
        password: parts[3] || '',
      };
    }).filter((row) => row.email);
  }

  async function submitBulk() {
    const parsed = parseBulkText(bulkText);
    if (!parsed.length) {
      setBulkError('Nenhum usuário encontrado. Use o formato: email; nome; perfil; senha');
      return;
    }
    setBulkSaving(true);
    setBulkError('');
    setBulkResult(null);
    try {
      const response = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        credentials: 'same-origin',
        body: JSON.stringify({ users: parsed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha na importação.');
      setBulkResult(data);
      if (data.created?.length && onRefresh) onRefresh();
    } catch (requestError) {
      setBulkError(requestError.message);
    } finally {
      setBulkSaving(false);
    }
  }

  function copyBulkCredentials() {
    if (!bulkResult?.created?.length) return;
    const text = bulkResult.created.map((user) => `${user.email}\t${user.password}`).join('\n');
    navigator.clipboard.writeText(text);
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!editingUser || !editForm) return;
    const updated = await onUpdate(editingUser.id, editForm);
    if (updated) {
      setEditingUserId(null);
      setEditForm(null);
    }
  }

  function handleCsvFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setBulkText(loadEvent.target.result);
      setBulkResult(null);
      setBulkError('');
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  return (
    <div className="users-layout">
      <div className="users-sidebar">
        <section className="surface">
          <div className="surface-title"><h2>Novo usuário</h2></div>
          <form className="user-form" onSubmit={onCreate}>
            <label htmlFor="user-name">Nome do consultor</label>
            <input id="user-name" type="text" autoComplete="off" value={form.display_name} onChange={(event) => onFormChange({ ...form, display_name: event.target.value })} placeholder="Nome completo" />
            <label htmlFor="user-email">E-mail</label>
            <input id="user-email" type="email" autoComplete="off" value={form.email} onChange={(event) => onFormChange({ ...form, email: event.target.value })} required />
            <PasswordField id="user-password" label="Senha inicial" value={form.password} onChange={(event) => onFormChange({ ...form, password: event.target.value })} required />
            <PasswordField id="user-password-confirmation" label="Confirme a senha" value={form.password_confirmation} onChange={(event) => onFormChange({ ...form, password_confirmation: event.target.value })} required />
            <small>Mínimo de 12 caracteres. O usuário deverá trocar a senha no primeiro login.</small>
            <label htmlFor="user-role">Perfil</label>
            <select id="user-role" value={form.role} onChange={(event) => onFormChange({ ...form, role: event.target.value })}>
              <option value="operador">Operador</option>
              <option value="admin">Administrador</option>
            </select>
            <button type="submit" disabled={saving}>{saving ? 'Criando…' : 'Criar usuário'}</button>
          </form>
          {error ? <p className="admin-error">{error}</p> : null}
          {message ? <p className="admin-success">{message}</p> : null}
        </section>

        <section className="surface">
          <div className="surface-title">
            <h2>Importação em massa</h2>
            <button className="toggle-link" onClick={() => { setBulkMode(!bulkMode); setBulkResult(null); setBulkError(''); }}>{bulkMode ? 'Fechar' : 'Abrir'}</button>
          </div>
          {bulkMode ? (
            <div className="bulk-body">
              <p className="bulk-help">Cole os dados ou envie um arquivo <strong>.csv</strong>. Separadores aceitos: <code>;</code> <code>,</code> <code>Tab</code>. Um usuário por linha.</p>
              <div className="bulk-format">
                <strong>Formato:</strong> email ; nome do consultor ; perfil (operador/admin) ; senha (opcional)
              </div>
              <div className="bulk-input-tabs">
                <label className="bulk-file-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
                  Enviar arquivo CSV
                  <input type="file" accept=".csv,.txt" onChange={handleCsvFile} hidden />
                </label>
                <span className="bulk-or">ou cole abaixo</span>
              </div>
              <textarea className="bulk-textarea" rows={6} placeholder={'maria@empresa.com; Maria Silva; operador; senha12345678\njose@empresa.com; José Santos; operador'} value={bulkText} onChange={(event) => setBulkText(event.target.value)} />
              <div className="bulk-preview-info">
                {bulkText.trim() ? <span>{parseBulkText(bulkText).length} usuário(s) detectado(s)</span> : null}
              </div>
              {bulkError ? <p className="admin-error">{bulkError}</p> : null}
              <div className="bulk-actions">
                <button onClick={submitBulk} disabled={bulkSaving || !bulkText.trim()}>{bulkSaving ? 'Importando…' : 'Importar usuários'}</button>
                {bulkText.trim() ? <button className="bulk-clear-btn" onClick={() => { setBulkText(''); setBulkResult(null); }}>Limpar</button> : null}
              </div>
              {bulkResult ? (
                <div className="bulk-result">
                  {bulkResult.created?.length ? (
                    <div className="bulk-success-block">
                      <div className="bulk-result-header">
                        <strong>{bulkResult.created.length} usuário(s) criado(s)</strong>
                        <button className="copy-link" onClick={copyBulkCredentials}>Copiar credenciais</button>
                      </div>
                      <p className="bulk-note">Todos devem trocar a senha no primeiro login. Copie as credenciais antes de fechar.</p>
                      <div className="bulk-credentials-table">
                        <table>
                          <thead><tr><th>E-mail</th><th>Nome</th><th>Senha provisória</th></tr></thead>
                          <tbody>
                            {bulkResult.created.map((user, index) => (
                              <tr key={index}>
                                <td>{user.email}</td>
                                <td>{user.display_name || '—'}</td>
                                <td className="mono">{user.password}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  {bulkResult.errors?.length ? (
                    <div className="bulk-errors-block">
                      <strong>{bulkResult.errors.length} erro(s):</strong>
                      <ul>{bulkResult.errors.map((err, index) => <li key={index}>Linha {err.line} ({err.email}): {err.error}</li>)}</ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
      <section className="surface users-list">
        <div className="surface-title"><h2>Contas cadastradas</h2><strong>{users.length}</strong></div>
        <div className="audit-table-wrap">
          <table className="audit-table users-table">
            <thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Última atividade</th><th>Ações</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}{user.id === currentUserId ? <small className="self-label">Você</small> : null}</td>
                  <td>{user.role === 'admin' ? 'Administrador' : 'Operador'}</td>
                  <td><span className={`status ${user.is_active ? 'active' : 'inactive'}`}>{user.is_active ? 'Ativo' : 'Inativo'}</span></td>
                  <td>{formatDate(user.last_activity)}</td>
                  <td className="user-actions">
                    <button onClick={() => startEditing(user)}>Editar</button>
                    {user.id !== currentUserId ? <button className="danger-button" onClick={() => resetPassword(user.id)}>Redefinir senha</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {tempPassword ? (
        <div className="modal-backdrop" role="presentation">
          <section className="surface edit-user-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <div className="surface-title"><h2 id="reset-title">Senha redefinida</h2><button onClick={() => setTempPassword('')}>Fechar</button></div>
            <div className="user-form" style={{ gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '13px' }}>Copie a senha abaixo e envie ao usuário. Ela não será exibida novamente.</p>
              <input type="text" readOnly value={tempPassword} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '16px', textAlign: 'center', letterSpacing: '0.05em' }} onClick={(e) => e.target.select()} />
              <button type="button" onClick={() => { navigator.clipboard.writeText(tempPassword); setTempPassword(''); }}>Copiar e fechar</button>
            </div>
          </section>
        </div>
      ) : null}
      {editingUser && editForm ? (
        <div className="modal-backdrop" role="presentation">
          <section className="surface edit-user-modal" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
            <div className="surface-title"><h2 id="edit-user-title">Editar usuário</h2><button onClick={() => setEditingUserId(null)}>Fechar</button></div>
            <form className="user-form" onSubmit={submitEdit}>
              <label htmlFor="edit-user-name">Nome do consultor</label>
              <input id="edit-user-name" type="text" value={editForm.display_name} onChange={(event) => setEditForm({ ...editForm, display_name: event.target.value })} placeholder="Nome completo" />
              <label htmlFor="edit-user-email">E-mail</label>
              <input id="edit-user-email" type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} required />
              <label htmlFor="edit-user-role">Perfil</label>
              <select id="edit-user-role" value={editForm.role} disabled={editingUser.id === currentUserId} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}>
                <option value="operador">Operador</option>
                <option value="admin">Administrador</option>
              </select>
              {editingUser.id === currentUserId ? <small>Seu próprio perfil administrativo não pode ser removido.</small> : null}
              <label className="active-check"><input type="checkbox" checked={editForm.is_active} disabled={editingUser.id === currentUserId} onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })} /> Usuário ativo</label>
              <PasswordField id="edit-user-password" label="Nova senha (opcional)" value={editForm.password} onChange={(event) => setEditForm({ ...editForm, password: event.target.value })} />
              <PasswordField id="edit-user-password-confirmation" label="Confirme a nova senha" value={editForm.password_confirmation} onChange={(event) => setEditForm({ ...editForm, password_confirmation: event.target.value })} />
              <div className="edit-actions"><button type="button" className="secondary-button" onClick={() => setEditingUserId(null)}>Cancelar</button><button type="submit">Salvar alterações</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function formatTMs(avgSeconds) {
  if (avgSeconds == null) return '-';
  const minutes = Math.floor(avgSeconds / 60);
  const seconds = Math.round(avgSeconds % 60);
  return `${minutes}m${String(seconds).padStart(2, '0')}s`;
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TIMEZONE });
}

function formatDateShort(value) {
  if (!value) return '-';
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = new Date(str);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR', { timeZone: TIMEZONE });
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function weekAgoISO() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function ReportsView() {
  const [rows, setRows] = useState([]);
  const [dateFrom, setDateFrom] = useState(weekAgoISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadReport = useCallback(async (from, to) => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/reports/productivity?from=${from}&to=${to}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Não foi possível carregar o relatório.');
      const data = await response.json();
      setRows(data.rows || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReport(dateFrom, dateTo); }, []);

  function exportExcel() {
    window.open(`/api/admin/reports/productivity/excel?from=${dateFrom}&to=${dateTo}`, '_blank');
  }

  const totalSimulations = rows.reduce((sum, row) => sum + (row.simulations || 0), 0);
  const uniqueDays = new Set(rows.map((row) => row.report_date)).size;
  const uniqueConsultants = new Set(rows.map((row) => row.email)).size;

  return (
    <>
      <div className="report-filters">
        <div className="report-date-group">
          <label htmlFor="report-from">De</label>
          <input id="report-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="report-date-group">
          <label htmlFor="report-to">Até</label>
          <input id="report-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => loadReport(dateFrom, dateTo)} disabled={loading}>{loading ? 'Carregando…' : 'Gerar relatório'}</button>
        {rows.length ? <button className="btn-secondary" onClick={exportExcel}>Exportar Excel</button> : null}
      </div>

      <div className="metrics" style={{ marginBottom: '16px' }}>
        <Metric label="Total de simulações" value={totalSimulations} tone="accent" />
        <Metric label="Dias com atividade" value={uniqueDays} />
        <Metric label="Consultores ativos" value={uniqueConsultants} tone="success" />
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <section className="surface">
        <div className="surface-title"><h2>Produtividade por consultor</h2><strong style={{ color: '#ffad42' }}>{rows.length} registro{rows.length !== 1 ? 's' : ''}</strong></div>
        <div className="audit-table-wrap">
          <table className="audit-table report-table">
            <thead>
              <tr>
                <th>Login</th>
                <th>Consultor</th>
                <th>Data</th>
                <th>Primeiro relatório</th>
                <th>Último relatório</th>
                <th>TMs</th>
                <th>Simulações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="7" className="empty">Carregando relatório…</td></tr> :
                rows.length ? rows.map((row, index) => (
                  <tr key={index}>
                    <td>{row.email}</td>
                    <td>{row.display_name || '-'}</td>
                    <td>{formatDateShort(row.report_date)}</td>
                    <td>{formatTime(row.first_at)}</td>
                    <td>{formatTime(row.last_at)}</td>
                    <td><strong>{formatTMs(row.avg_seconds)}</strong></td>
                    <td><strong className="processed-count">{row.simulations}</strong></td>
                  </tr>
                )) : <tr><td colSpan="7" className="empty">Nenhuma simulação encontrada no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function RestrictionsView({ csrfToken }) {
  const [blocked, setBlocked] = useState([]);
  const [banks, setBanks] = useState({});
  const [expanded, setExpanded] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [blockedResponse, matrixResponse] = await Promise.all([
          fetch('/api/blocked-entities', { credentials: 'same-origin' }),
          fetch('/api/commercial-matrix', { credentials: 'same-origin', cache: 'no-store' }),
        ]);
        if (!blockedResponse.ok || !matrixResponse.ok) throw new Error('Não foi possível carregar os dados.');
        const blockedData = await blockedResponse.json();
        const matrixData = await matrixResponse.json();
        setBlocked(blockedData.blocked || []);
        const grouped = {};
        (matrixData.rows || []).forEach((row) => {
          if (!row.banco || ['Base Geral', 'Todos os Bancos'].includes(row.banco)) return;
          if (!row.operacao || row.operacao === 'Todas as Operações') return;
          if (!grouped[row.banco]) grouped[row.banco] = new Set();
          grouped[row.banco].add(row.operacao);
        });
        const sorted = {};
        Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach((bank) => {
          sorted[bank] = [...grouped[bank]].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        });
        setBanks(sorted);
      } catch (requestError) {
        setError(requestError.message);
      }
    }
    load();
  }, []);

  function isBankFullBlocked(bank) {
    return blocked.includes(bank);
  }

  function isOpBlocked(bank, op) {
    return blocked.includes(`${bank}::${op}`);
  }

  function toggleBank(bank) {
    setMessage('');
    setBlocked((current) => {
      if (current.includes(bank)) {
        return current.filter((item) => item !== bank && !item.startsWith(`${bank}::`));
      }
      const withoutOps = current.filter((item) => !item.startsWith(`${bank}::`));
      return [...withoutOps, bank];
    });
  }

  function toggleOp(bank, op) {
    setMessage('');
    const key = `${bank}::${op}`;
    setBlocked((current) => {
      if (current.includes(bank)) return current;
      return current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    });
  }

  function toggleExpand(bank) {
    setExpanded((current) => ({ ...current, [bank]: !current[bank] }));
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/blocked-entities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        credentials: 'same-origin',
        body: JSON.stringify({ blocked }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      setBlocked(data.blocked || []);
      setMessage('Restrições salvas. As alterações já estão ativas na calculadora.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const blockedBanks = Object.keys(banks).filter((bank) => isBankFullBlocked(bank)).length;
  const blockedOps = blocked.filter((item) => item.includes('::')).length;
  const bankList = Object.keys(banks);

  return (
    <div className="restrictions-container">
      {error ? <p className="admin-error">{error}</p> : null}
      {message ? <p className="admin-success">{message}</p> : null}
      <section className="surface">
        <div className="surface-title">
          <h2>Bancos e operações</h2>
          <div className="restrictions-counters">
            {blockedBanks ? <span className="restriction-badge">{blockedBanks} banco{blockedBanks !== 1 ? 's' : ''} bloqueado{blockedBanks !== 1 ? 's' : ''}</span> : null}
            {blockedOps ? <span className="restriction-badge">{blockedOps} operação{blockedOps !== 1 ? 'ões' : ''} bloqueada{blockedOps !== 1 ? 's' : ''}</span> : null}
            {!blockedBanks && !blockedOps ? <span style={{ color: '#65d99a', fontSize: '13px' }}>Nenhuma restrição ativa</span> : null}
          </div>
        </div>
        <div className="restrictions-body">
          <p className="restrictions-help">
            Bloqueie um <strong>banco inteiro</strong> ou expanda para bloquear <strong>operações específicas</strong> (quitação, crescente, decrescente, etc).
          </p>
          <div className="restrictions-list-v2">
            {bankList.length ? bankList.map((bank) => {
              const fullBlocked = isBankFullBlocked(bank);
              const ops = banks[bank] || [];
              const blockedOpsCount = ops.filter((op) => isOpBlocked(bank, op)).length;
              const isOpen = expanded[bank];
              return (
                <div key={bank} className={`bank-group ${fullBlocked ? 'bank-blocked' : blockedOpsCount ? 'bank-partial' : ''}`}>
                  <div className="bank-header">
                    <label className="bank-toggle">
                      <input type="checkbox" checked={fullBlocked} onChange={() => toggleBank(bank)} />
                      <span className="bank-name">{bank}</span>
                      {fullBlocked ? <small className="restriction-badge">Totalmente bloqueado</small> : blockedOpsCount ? <small className="restriction-badge partial">{blockedOpsCount} op. bloqueada{blockedOpsCount !== 1 ? 's' : ''}</small> : null}
                    </label>
                    <button className={`expand-btn ${isOpen ? 'open' : ''}`} onClick={() => toggleExpand(bank)} title="Ver operações">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="ops-list">
                      {ops.map((op) => (
                        <label key={op} className={`op-item ${fullBlocked || isOpBlocked(bank, op) ? 'op-blocked' : ''}`}>
                          <input type="checkbox" checked={fullBlocked || isOpBlocked(bank, op)} disabled={fullBlocked} onChange={() => toggleOp(bank, op)} />
                          <span>{op}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }) : <p className="empty">Nenhum banco encontrado na matriz comercial.</p>}
          </div>
        </div>
        <div className="restrictions-actions">
          <button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar restrições'}</button>
        </div>
      </section>
    </div>
  );
}

function AuditTable({ rows, loading = false, compact = false }) {
  return (
    <div className="audit-table-wrap">
      <table className="audit-table">
        <thead><tr><th>Data e hora</th><th>Usuário</th><th>Evento</th>{compact ? null : <th>Detalhes</th>}<th>IP</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={compact ? 4 : 5} className="empty">Carregando auditoria…</td></tr> :
            rows.length ? rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.created_at)}</td>
                <td>{row.email || 'Não identificado'}</td>
                <td><span className={`event event-${row.event}`}>{EVENT_LABELS[row.event] || row.event}</span></td>
                {compact ? null : <td>{row.details || '—'}</td>}
                <td className="mono">{row.ip_address || '—'}</td>
              </tr>
            )) : <tr><td colSpan={compact ? 4 : 5} className="empty">Nenhum evento encontrado.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><AdminApp /></StrictMode>);
