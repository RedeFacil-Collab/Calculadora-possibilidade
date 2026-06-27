import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepConnected, setKeepConnected] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password, keep_connected: keepConnected }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
      if (data.must_change_password) {
        setChangingPassword(true);
        return;
      }
      window.location.assign(data.redirect_to || '/');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    setError('');
    if (newPassword !== newPasswordConfirmation) {
      setError('A senha e a confirmação não conferem.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ new_password: newPassword, new_password_confirmation: newPasswordConfirmation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível alterar a senha.');
      window.location.assign(data.redirect_to || '/');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-form-area">
          <div className="brand"><span className="brand-dot" />Calculadora de Possibilidade</div>
          {changingPassword ? (
            <>
              <h1 id="login-title">Crie sua nova senha</h1>
              <p className="intro">Seu primeiro acesso requer a criação de uma senha pessoal.</p>
              <form onSubmit={handleChangePassword}>
                <label htmlFor="new-password">Nova senha</label>
                <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                <label htmlFor="new-password-confirmation">Confirme a nova senha</label>
                <input id="new-password-confirmation" type="password" autoComplete="new-password" value={newPasswordConfirmation} onChange={(event) => setNewPasswordConfirmation(event.target.value)} required />
                <small className="password-hint">Mínimo de 12 caracteres.</small>
                {error && <p className="error" role="alert">{error}</p>}
                <button type="submit" disabled={submitting}>{submitting ? 'Salvando…' : 'Salvar nova senha'}</button>
              </form>
            </>
          ) : (
            <>
              <h1 id="login-title">Acesse sua conta</h1>
              <p className="intro">Entre para consultar e administrar as informações autorizadas.</p>
              <form onSubmit={handleSubmit}>
                <label htmlFor="email">E-mail</label>
                <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                <label htmlFor="password">Senha</label>
                <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                <div className="form-options">
                  <label className="check-label"><input type="checkbox" checked={keepConnected} onChange={(event) => setKeepConnected(event.target.checked)} /> Manter conectado</label>
                  <span>Solicite a redefinição ao administrador.</span>
                </div>
                {error && <p className="error" role="alert">{error}</p>}
                <button type="submit" disabled={submitting}>{submitting ? 'Entrando…' : 'Entrar'}</button>
              </form>
            </>
          )}
          <p className="security">Acesso protegido e monitorado.</p>
        </div>
        <aside className="login-art" aria-hidden="true"><div className="grid-art" /></aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><LoginScreen /></StrictMode>);
