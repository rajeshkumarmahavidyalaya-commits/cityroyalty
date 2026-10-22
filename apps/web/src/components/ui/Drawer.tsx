'use client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'right' | 'left' | 'top' | 'center';
  width?: string;
  children: ReactNode;
  hideTitle?: boolean;
  className?: string;
}

/** Accessible modal panel: focus trap, Escape, scroll lock, focus restore, reduced-motion aware. */
export function Drawer({ open, onClose, title, side = 'right', width = 'min(30rem, 100vw)', children, hideTitle, className = '' }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const returnTo = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  // callers pass inline handlers; keep the latest without re-running the focus effect on every render
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => (ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? closeBtn.current ?? ref.current)?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close.current();
      if (e.key !== 'Tab' || !ref.current) return;
      const els = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0]!, last = els[els.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      returnTo.current?.focus?.();
    };
  }, [open]);

  const from = side === 'right' ? { x: '100%' } : side === 'left' ? { x: '-100%' } : side === 'center' ? { opacity: 0, y: 24 } : { y: '-100%' };
  const pos = side === 'right' ? 'right-0 top-0 h-dvh' : side === 'left' ? 'left-0 top-0 h-dvh' : side === 'center' ? 'left-1/2 top-1/2 max-h-[92dvh] -translate-x-1/2 -translate-y-1/2' : 'left-0 right-0 top-0 max-h-dvh';
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]" role="presentation">
          <motion.div
            className="absolute inset-0 bg-royal/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.3 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={hideTitle ? undefined : titleId}
            aria-label={hideTitle ? title : undefined}
            tabIndex={-1}
            className={`absolute flex flex-col overflow-y-auto bg-ivory shadow-2xl outline-none ${pos} ${className}`}
            style={side === 'top' ? { width: '100%' } : { width }}
            initial={reduce ? { opacity: 0 } : from}
            animate={reduce ? { opacity: 1 } : { x: 0, y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : from}
            transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className={`flex items-center justify-between border-b border-line px-5 py-4 ${hideTitle ? 'sr-only' : ''}`}>
              <h2 id={titleId} className="font-serif text-2xl">{title}</h2>
              <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close" className="-mr-2 p-2">
                <CloseIcon />
              </button>
            </div>
            {hideTitle && (
              <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 p-2">
                <CloseIcon />
              </button>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
