'use client';

import { useEffect, useRef } from 'react';
import '@/lib/flow-viewer/style.css';
import { FlowViewer } from '@/lib/flow-viewer/flow-viewer';
import type { FlowData } from '@/lib/flow-viewer/types';

// Menampilkan satu alur n8n beranimasi. `flow` harus berisi tepat satu skenario (jalur eksekusi yang ingin diputar ulang).
export function FlowReplay({ flow, errorIds }: { flow: FlowData; errorIds: number[] }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';
    const viewer = new FlowViewer(host, flow, { captureWheel: false, autoplay: true });
    viewer.markErrors(errorIds);
    return () => viewer.destroy();
  }, [flow, errorIds]);

  return (
    <div
      ref={hostRef}
      className="overflow-hidden rounded-xl border border-gray-200"
      style={{ height: '72vh', minHeight: 480 }}
      aria-label="Replay jalur eksekusi"
    />
  );
}
