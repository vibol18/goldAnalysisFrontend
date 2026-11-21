import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import Disclaimer from '../components/Disclaimer';

/** Sign-in / sign-up gate. Cookies are httpOnly; no tokens are stored in JS. */
export default function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password, totp || undefined);
      else await signup(email, username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md space-y-4 py-8">
      <Disclaimer className="text-center" />
      <div className="card space-y-4">
        <div>
          <h1 className="text-xl font-bold text-white">GoldSight</h1>
          <p className="text-xs text-slate-400">
            {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
          </p>
        </div>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <label className="block">
            <span className="label">Email</span>
            <input className="input w-full" type="email" required value={email}
                   onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {mode === 'signup' && (
            <label className="block">
              <span className="label">Username</span>
              <input className="input w-full" required minLength={2} maxLength={64}
                     value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className="label">Password</span>
            <input className="input w-full" type="password" required minLength={12}
                   value={password} onChange={(e) => setPassword(e.target.value)}
                   autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {mode === 'login' && (
            <label className="block">
              <span className="label">2FA code (if enabled)</span>
              <input className="input w-full" inputMode="numeric" maxLength={8}
                     value={totp} onChange={(e) => setTotp(e.target.value)} autoComplete="one-time-code" />
            </label>
          )}
          {error && <p className="text-xs text-red-300">{error}</p>}
          <button className="btn-gold w-full" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button className="btn-ghost w-full" type="button"
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Need an account? Sign up' : 'Already registered? Sign in'}
        </button>
      </div>
      <Disclaimer />
    </section>
  );
}
