import React from 'react';
import { LogOut, Moon, Sun, MessageSquare, HelpCircle } from 'lucide-react';
import type { ActiveTab, ThemeMode, UserState } from '../types/chat';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  userState: UserState;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  theme,
  onToggleTheme,
  userState,
  onLogout,
}) => {
  const badgeText = userState.isGuest ? 'Guest Mode' : userState.displayName || userState.email || 'Signed In';

  return (
    <header className="sticky top-0 z-30 h-14 sm:h-16 shrink-0 bg-[#F7F9FC]/95 dark:bg-[#0E1117]/95 backdrop-blur-md border-b border-[#E2E8F0] dark:border-[#262E3B]">
      <div className="max-w-7xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-6">
        <div className="flex items-center gap-2 sm:gap-5 min-w-0">
          <span className="font-display text-sm sm:text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
            <span className="sm:hidden">Material AI</span>
            <span className="hidden sm:inline">Material AI Chat</span>
          </span>

          <nav
            role="tablist"
            aria-label="Primary sections"
            className="flex items-center gap-0.5 sm:gap-1 p-1 rounded-xl bg-[#EEF2F7] dark:bg-[#1E2530] shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'chat'}
              onClick={() => onSelectTab('chat')}
              className={`min-h-[34px] sm:min-h-[36px] px-2.5 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'chat'
                  ? 'bg-white dark:bg-[#2A3342] text-[#0B57D0] dark:text-[#A8C7FA]'
                  : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'help'}
              onClick={() => onSelectTab('help')}
              className={`min-h-[34px] sm:min-h-[36px] px-2.5 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'help'
                  ? 'bg-white dark:bg-[#2A3342] text-[#0B57D0] dark:text-[#A8C7FA]'
                  : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Help</span>
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <span
            title={userState.email || badgeText}
            className="hidden md:inline-block text-xs font-medium text-[#475569] dark:text-[#94A3B8] max-w-[160px] truncate"
          >
            {badgeText}
          </span>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="min-h-[38px] min-w-[38px] sm:min-h-[40px] sm:min-w-[40px] px-2 sm:px-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#262E3B] bg-white dark:bg-[#171C24] hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530] inline-flex items-center justify-center gap-1.5 text-xs font-medium transition-colors shrink-0"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline whitespace-nowrap">
              {theme === 'dark' ? 'Light' : 'Dark'}
            </span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 rounded-xl border border-[#E2E8F0] dark:border-[#262E3B] bg-white dark:bg-[#171C24] hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530] text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
