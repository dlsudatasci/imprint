import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';

/**
 * Modal confirmation for an action that can't be undone.
 *
 * Used wherever a contributor is about to lose work — stopping an annotation
 * session from the dashboard or from the annotation form itself.
 *
 * Behaviour worth knowing: it renders into <main> (falling back to <body>) so
 * it inherits the font variables declared there, closes on Escape, and locks
 * background scrolling while open.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  /** Label for the confirming action. Say what happens, not "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Renders the confirm action in the danger variant. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm font-sans antialiased"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-modal p-8 max-w-md w-full shadow-2xl border border-line-card text-left"
      >
        <h3 className="font-display text-2xl font-bold text-ink mb-3">{title}</h3>
        {description && (
          <p className="text-muted mb-8 leading-relaxed font-medium">{description}</p>
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="neutral" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.querySelector('main') || document.body,
  );
}
