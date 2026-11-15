import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { SyncQueueStatusResponse } from '../types/sync';
import { fetchSyncStatus, triggerSyncFlush } from '../services/syncApi';

export const SyncStatusWidget: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncQueueStatusResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);

  const loadStatus = async () => {
    try {
      const data = await fetchSyncStatus();
      setSyncStatus(data);
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  };

  useEffect(() => {
    loadStatus();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(loadStatus, 20000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await triggerSyncFlush();
      await loadStatus();
    } catch (err) {
      console.error('Failed to trigger manual sync:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const pendingCount = syncStatus?.pending_count || 0;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-xs text-slate-300 transition"
        title="Offline & Edge Sync Status"
      >
        {isOnline ? (
          <Cloud className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <CloudOff className="w-3.5 h-3.5 text-amber-400" />
        )}
        <span className="font-medium">{isOnline ? 'Online' : 'Offline'}</span>

        {pendingCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Sync Status Drawer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <Cloud className="w-5 h-5 text-emerald-400" />
                ) : (
                  <CloudOff className="w-5 h-5 text-amber-400" />
                )}
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Edge Synchronization</h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Mode: {isOnline ? 'Direct Cloud Sync' : 'Local SQLite Storage'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                <span className="text-slate-400 block text-[10px]">Pending Uploads</span>
                <span className="text-lg font-bold text-amber-400">{pendingCount}</span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                <span className="text-slate-400 block text-[10px]">Synced Events</span>
                <span className="text-lg font-bold text-emerald-400">
                  {syncStatus?.synced_count || 0}
                </span>
              </div>
            </div>

            {syncStatus?.last_synced_at && (
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>
                  Last synced: {new Date(syncStatus.last_synced_at).toLocaleTimeString()}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                onClick={handleManualSync}
                disabled={isSyncing || !isOnline}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 transition shadow-lg shadow-indigo-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Synchronizing...' : 'Flush Sync Queue Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
