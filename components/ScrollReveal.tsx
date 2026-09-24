'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Mengungkap children dengan fade + translateY sekali saat masuk viewport.
 * Menghormati prefers-reduced-motion (fallback ke fade-only tanpa transform).
 * Dipakai untuk tiap section landing page — bukan tiap kartu individual,
 * supaya tidak jadi "semua elemen berteriak bersamaan".
 */
export default function ScrollReveal({
  children,
  className = '',
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 400ms cubic-bezier(0.23,1,0.32,1) ${delayMs}ms, transform 400ms cubic-bezier(0.23,1,0.32,1) ${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}
