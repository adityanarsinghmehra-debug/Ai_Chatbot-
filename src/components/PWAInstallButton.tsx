import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Install Android or Desktop App"
        className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-[#0B57D0] text-white dark:bg-[#A8C7FA] dark:text-[#062E6F] text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
      >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install app on iOS"
          className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 rounded-xl border border-[#E2E8F0] dark:border-[#262E3B] bg-white dark:bg-[#171C24] hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530] text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-4 h-4" />
          <span className="hidden sm:inline">Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#171C24] border border-[#E2E8F0] dark:border-[#262E3B] p-6 shadow-xl space-y-3">
              <h3 className="font-display text-lg font-semibold">Install on iPhone / iPad</h3>
              <p className="text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                1. Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[40px] rounded-xl bg-[#EEF2F7] dark:bg-[#1E2530] text-sm font-medium hover:opacity-90"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
