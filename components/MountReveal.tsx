'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Sama seperti ScrollReveal, tapi trigger sekali saat mount (bukan scroll-into-view).
 * Khusus untuk 1 sequence sinematik di hero — bukan dipakai berulang di banyak tempat.
 */
export default function MountReveal({
  children,
  className = '',
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 500ms cubic-bezier(0.23,1,0.32,1) ${delayMs}ms, transform 500ms cubic-bezier(0.23,1,0.32,1) ${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}
