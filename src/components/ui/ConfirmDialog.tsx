"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Input } from "./Input";

/**
 * Accessible confirmation modal. With `confirmText`, the user must type it
 * (e.g. the family name) before a destructive action is enabled.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  confirmText,
  danger = false,
  loading = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  confirmText?: string;
  danger?: boolean;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [typed, setTyped] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setTyped("");
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !loading && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  const canConfirm = !confirmText || typed.trim() === confirmText;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && !loading && onClose()}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="glass-strong w-full max-w-md rounded-2xl p-6"
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
          >
            <h2 id={titleId} className="font-display text-lg font-semibold text-white">
              {title}
            </h2>
            {description && <div className="mt-2 text-sm leading-relaxed text-slate-400">{description}</div>}
            {confirmText && (
              <div className="mt-4">
                <Input
                  label={`Type "${confirmText}" to confirm`}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm text-[#ff8399]">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button ref={cancelRef} variant="ghost" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading} disabled={!canConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
