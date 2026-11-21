import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Disclaimer from './components/Disclaimer';
import StatusBadge from './components/StatusBadge';
import { AlertsProvider } from './components/AlertsProvider';
import { LiveStreamProvider } from './lib/liveStream';
import { AuthProvider, useAuth } from './lib/auth';

const SignalsHistory = lazy(() => import('./pages/SignalsHistory'));
const Debug = lazy(() => import('./pages/Debug'));
const Backtest = lazy(() => import('./pages/Backtest'));
const Stats = lazy(() => import('./pages/Stats'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const Login = lazy(() => import('./pages/Login'));
const Chat = lazy(() => import('./pages/Chat'));
const Learn = lazy(() => import('./pages/Learn'));
const Settings = lazy(() => import('./pages/Settings'));

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◆' },
  { to: '/signals', label: 'Signals', icon: '▲' },
  { to: '/backtest', label: 'Backtest', icon: '▤' },
  { to: '/stats', label: 'Stats', icon: '◫' },
  { to: '/calendar', label: 'Calendar', icon: '▣' },
  { to: '/chat', label: 'AI Chat', icon: '✦' },
  { to: '/learn', label: 'Learn', icon: '◈' },
  { to: '/debug', label: 'Debug', icon: '⌗' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];
const PAGE_PATHS = new Set(navItems.map((item) => item.to));

function AppShell() {
  const { user, loading, serverWaking, logout } = useAuth();
  const location = useLocation();
  const path = PAGE_PATHS.has(location.pathname) ? location.pathname : '/';
  const [visited, setVisited] = useState<string[]>([path]);

  useEffect(() => {
    setVisited((prev) => prev.includes(path) ? prev : [...prev, path]);
  }, [path]);

  const page = (key: string, node: ReactNode) =>
    visited.includes(key) ? (
      <div key={key} className={path === key ? '' : 'hidden'}>
        {node}
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="card m-8 text-center text-sm text-slate-400">
        {serverWaking ? 'Server is waking up, please wait...' : 'Loading…'}
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        {serverWaking && (
          <div role="status" className="bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
            Server is waking up, please wait...
          </div>
        )}
        <main className="flex-1">
          <Suspense fallback={<div className="card m-8 text-center">Loading…</div>}>
            <Login />
          </Suspense>
        </main>
        <footer className="border-t border-white/5 py-3">
          <Disclaimer className="mx-auto max-w-7xl px-4 text-center" />
        </footer>
      </div>
    );
  }

  return (
    <LiveStreamProvider>
      <AlertsProvider>
        <div className="min-h-screen flex flex-col">
          {serverWaking && (
            <div role="status" className="bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
              Server is waking up, please wait...
            </div>
          )}
          <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0b0d12]/95 backdrop-blur">
            <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-gold text-xl font-black tracking-tight">Gold</span>
                <span className="text-white text-xl font-black tracking-tight">Sight</span>
                <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-slate-500 border border-white/10 rounded px-1.5 py-0.5 ml-1">
                  XAU/USD
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden lg:inline text-[10px] text-slate-500 truncate max-w-32" title={user.email}>
                  {user.username}
                </span>
                <button className="btn-ghost !py-1 !px-2 text-xs" type="button"
                        onClick={() => void logout()} title="Sign out">Sign out</button>
                <StatusBadge />
                <nav className="flex items-center gap-1 overflow-x-auto">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                          isActive
                            ? 'bg-gold/15 text-gold font-semibold'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`
                      }
                    >
                      <span className="mr-1.5 opacity-70">{item.icon}</span>
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
            </div>
          </header>

          <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-5">
            <Suspense fallback={<div className="card text-center text-sm text-slate-400">Loading…</div>}>
              {page('/', <Dashboard />)}
              {page('/signals', <SignalsHistory />)}
              {page('/backtest', <Backtest />)}
              {page('/stats', <Stats />)}
              {page('/calendar', <CalendarPage />)}
              {page('/chat', <Chat />)}
              {page('/learn', <Learn />)}
              {page('/debug', <Debug />)}
              {page('/settings', <Settings />)}
            </Suspense>
          </main>

          <footer className="border-t border-white/5 py-3">
            <Disclaimer className="mx-auto max-w-7xl px-4 text-center" />
          </footer>
        </div>
      </AlertsProvider>
    </LiveStreamProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
