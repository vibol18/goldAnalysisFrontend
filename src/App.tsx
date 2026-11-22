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
const CandleCheck = lazy(() => import('./pages/CandleCheck'));
const TradingViewCompare = lazy(() => import('./pages/TradingViewCompare'));
const TradingViewWidget = lazy(() => import('./pages/TradingViewWidget'));

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◆' },
  { to: '/signals', label: 'Signals', icon: '▲' },
  { to: '/backtest', label: 'Backtest', icon: '▤' },
  { to: '/stats', label: 'Stats', icon: '◫' },
  { to: '/calendar', label: 'Calendar', icon: '▣' },
  { to: '/chat', label: 'AI Chat', icon: '✦' },
  { to: '/learn', label: 'Learn', icon: '◈' },
  { to: '/debug', label: 'Debug', icon: '⌗' },
  { to: '/candle-check', label: 'Candle Check', icon: '◷' },
  { to: '/compare', label: 'Compare TV', icon: '≋' },
  { to: '/tv-widget', label: 'TradingView', icon: '▣' },
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
        <footer className="border-t border-white/[0.04] py-3">
          <Disclaimer className="mx-auto max-w-[1440px] px-6 text-center" />
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
          <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#090b10]/92 backdrop-blur-xl">
            <div className="mx-auto max-w-[1440px] px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <div className="grid h-8 w-8 place-items-center rounded-xl border border-gold/25 bg-gold/10 text-gold shadow-lg shadow-gold/5">
                  ◆
                </div>
                <span className="text-gold text-lg font-black tracking-tight">Meas</span>
                <span className="text-white text-lg font-black tracking-tight">Pro</span>
                <span className="hidden sm:inline text-[9px] uppercase tracking-[0.18em] text-slate-500 border border-white/[0.08] rounded-md px-2 py-1 ml-1">
                  XAU/USD
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden lg:inline text-[10px] text-slate-500 truncate max-w-32" title={user.email}>
                  {user.username}
                </span>
                <StatusBadge />
                <button className="hidden sm:inline-flex h-8 items-center rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 text-xs text-slate-400 hover:text-white" type="button"
                        onClick={() => void logout()} title="Sign out">Sign out</button>
              </div>
            </div>
          </header>
          <div className="mx-auto flex w-full max-w-[1440px] flex-1">
            <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-white/[0.05] px-3 py-5">
              <nav className="sticky top-[81px] space-y-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all ${
                        isActive
                          ? 'border border-gold/15 bg-gold/[0.09] text-gold font-semibold'
                          : 'border border-transparent text-slate-500 hover:border-white/[0.05] hover:bg-white/[0.035] hover:text-slate-200'
                      }`
                    }
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-white/[0.035] text-xs opacity-80">
                      {item.icon}
                    </span>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </aside>
            <main className="min-w-0 flex-1 px-4 py-5 lg:px-6 xl:px-8">
              <nav className="mb-4 flex gap-1 overflow-x-auto pb-1 lg:hidden">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `shrink-0 rounded-lg px-3 py-2 text-xs ${
                        isActive ? 'bg-gold/10 text-gold' : 'text-slate-500'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <div className="page-enter">
                <Suspense fallback={<div className="card text-center text-sm text-slate-400">Loading…</div>}>
                  {page('/', <Dashboard />)}
                  {page('/signals', <SignalsHistory />)}
                  {page('/backtest', <Backtest />)}
                  {page('/stats', <Stats />)}
                  {page('/calendar', <CalendarPage />)}
                  {page('/chat', <Chat />)}
                  {page('/learn', <Learn />)}
                  {page('/debug', <Debug />)}
                  {page('/candle-check', <CandleCheck />)}
                  {page('/compare', <TradingViewCompare />)}
                  {page('/tv-widget', <TradingViewWidget />)}
                  {page('/settings', <Settings />)}
                </Suspense>
              </div>
            </main>
          </div>

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
