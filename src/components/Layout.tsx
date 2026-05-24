import { NavLink, useLocation } from 'react-router-dom';
import { Home, Users, Calendar, BarChart2, Menu } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '@/store/useStore';

const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/roster', label: 'Roster', icon: Users },
  { to: '/games', label: 'Games', icon: Calendar },
  { to: '/stats', label: 'Stats', icon: BarChart2 },
  { to: '/more', label: 'More', icon: Menu }
];

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isGameActive = location.pathname.startsWith('/game/') &&
    !location.pathname.includes('setup');

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 max-w-lg mx-auto">
      <main className={`flex-1 overflow-auto ${isGameActive ? 'pb-0' : 'pb-20'}`}>
        {children}
      </main>
      {!isGameActive && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-200 z-40 pb-safe">
          <div className="flex">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'text-pitch-700'
                      : 'text-gray-400 hover:text-gray-600'
                  }`
                }
              >
                <Icon size={22} />
                <span className="mt-0.5">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
};
