'use client';

interface Props {
  lastUpdated: Date | null;
  refreshing: boolean;
  failed: boolean;
  autoOn: boolean;
  intervalSec: number;
  onToggle: () => void;
  onRefresh: () => void;
}

export function RefreshBar({ lastUpdated, refreshing, failed, autoOn, intervalSec, onToggle, onRefresh }: Props) {
  const waktu = lastUpdated
    ? lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '–';

  let status = `Diperbarui ${waktu}`;
  if (refreshing) status = 'Memperbarui...';
  else if (failed) status = lastUpdated ? `Gagal memperbarui (data terakhir ${waktu})` : 'Gagal memperbarui';

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-gray-500">
      <span className="flex items-center gap-1.5" aria-live="polite">
        <span
          className={`h-2 w-2 rounded-full ${failed ? 'bg-amber-500' : autoOn ? 'bg-emerald-500' : 'bg-gray-300'}`}
        />
        {status}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={autoOn}
        onClick={onToggle}
        className="flex items-center gap-1.5 hover:text-gray-700"
      >
        <span
          className={`relative inline-block h-4 w-7 rounded-full transition-colors ${
            autoOn ? 'bg-emerald-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
              autoOn ? 'left-3.5' : 'left-0.5'
            }`}
          />
        </span>
        <span>Auto-refresh{autoOn ? ` ${intervalSec} dtk` : ''}</span>
      </button>

      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <span className={`mr-1 inline-block ${refreshing ? 'animate-spin' : ''}`}>⟳</span>
        Refresh
      </button>
    </div>
  );
}
