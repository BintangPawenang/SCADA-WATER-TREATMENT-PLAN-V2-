import React, { useState } from 'react';
import { loginApi } from '../api';
import { UserInfo } from '../types';

interface LoginViewProps {
  onSuccess: (token: string, user: UserInfo) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr(null);
    setBusy(true);
    try {
      const res = await loginApi(username.trim(), password);
      onSuccess(res.access_token, res.user);
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleSubmit} autoComplete="off">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>WTP INDUSTRIAL SCADA</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Authorized Personnel Sign-In (IEC 62443 RBAC)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>Username</div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%' }}
              autoComplete="username"
              required
            />
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%' }}
              autoComplete="current-password"
              required
            />
          </label>
          {loginErr && <div style={{ color: '#f87171', fontSize: 12 }}>{loginErr}</div>}
          <button type="submit" className="btn btn-primary" style={{ marginTop: 6 }} disabled={busy}>
            {busy ? 'Authenticating...' : 'Authenticate'}
          </button>
        </div>
        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          Contact plant automation administrator for account provisioning and credential policy.
        </div>
      </form>
    </div>
  );
};
