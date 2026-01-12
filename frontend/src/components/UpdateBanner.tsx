import React from 'react';
import { useVersion } from '../hooks/useVersion';

interface UpdateBannerProps {
  className?: string;
}

const UpdateBanner: React.FC<UpdateBannerProps> = ({ className }) => {
  const { hasUpdate, reload, dismiss, checking } = useVersion();

  if (!hasUpdate) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 px-4 py-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white shadow-2xl rounded-t-lg backdrop-blur-sm ${className || ''}`}
      style={{ animation: 'slideUp 300ms ease-out' }}
    >
      <div className="flex flex-col">
        <span className="font-semibold tracking-wide">New version available</span>
        <span className="text-xs opacity-80">
          {checking ? 'Verifying assets…' : 'Reload to get latest features & fixes.'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={reload}
          className="px-3 py-1.5 text-sm font-medium bg-white/90 text-indigo-700 rounded-md shadow hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white"
        >
          Reload
        </button>
        <button
          onClick={dismiss}
          className="px-3 py-1.5 text-sm font-medium bg-black/30 rounded-md hover:bg-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default UpdateBanner;
