import React, { useEffect } from 'react';
import {
  Trash2,
  Lock,
  Unlock,
  KeyRound,
  X,
  Loader2,
  CheckCircle2,
  MailCheck,
  type LucideIcon,
} from 'lucide-react';

export type ConfirmActionType =
  | 'DELETE'
  | 'BLOCK'
  | 'UNBLOCK'
  | 'RESET_PASSWORD'
  | 'VERIFY_EMAIL'
  | 'VERIFY_PHONE'
  | 'UNVERIFY_EMAIL'
  | 'UNVERIFY_PHONE';

export interface ConfirmActionModalProps {
  isOpen: boolean;
  actionType: ConfirmActionType;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  customerName?: string;
  customerEmail?: string;
  isProcessing: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  reason?: string;
  onReasonChange?: (reason: string) => void;
  showReasonInput?: boolean;
}

interface ActionMeta {
  title: string;
  description: (email?: string) => string;
  confirmLabel: string;
  icon: LucideIcon;
  iconBg: string;
  confirmBtnClass: string;
}

const ACTION_METAS: Record<ConfirmActionType, ActionMeta> = {
  DELETE: {
    title: 'Delete Customer Account?',
    description: () =>
      'Are you sure you want to delete this customer? This action cannot be undone and will permanently remove their access.',
    confirmLabel: 'Yes, Delete',
    icon: Trash2,
    iconBg: 'bg-red-100 text-red-600 border-red-200',
    confirmBtnClass: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
  },
  BLOCK: {
    title: 'Block Customer?',
    description: () =>
      'Are you sure you want to block this customer? They will immediately lose access to log in and make purchases.',
    confirmLabel: 'Yes, Block',
    icon: Lock,
    iconBg: 'bg-rose-100 text-rose-600 border-rose-200',
    confirmBtnClass: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm',
  },
  UNBLOCK: {
    title: 'Unblock Customer?',
    description: () =>
      'Are you sure you want to unblock this customer? Their access to log in and make purchases will be restored.',
    confirmLabel: 'Yes, Unblock',
    icon: Unlock,
    iconBg: 'bg-emerald-100 text-emerald-600 border-emerald-200',
    confirmBtnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
  },
  RESET_PASSWORD: {
    title: 'Send Password Reset Link?',
    description: (email) =>
      email
        ? `Are you sure you want to send a password reset link to ${email}?`
        : 'Are you sure you want to send a password reset link to this customer?',
    confirmLabel: 'Yes, Send Link',
    icon: KeyRound,
    iconBg: 'bg-amber-100 text-amber-700 border-amber-200',
    confirmBtnClass: 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm',
  },
  VERIFY_EMAIL: {
    title: 'Verify Customer Email?',
    description: (email) =>
      email
        ? `Are you sure you want to mark ${email} as manually verified for this customer?`
        : 'Are you sure you want to mark this customer\'s email as verified?',
    confirmLabel: 'Yes, Verify Email',
    icon: MailCheck,
    iconBg: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    confirmBtnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
  },
  VERIFY_PHONE: {
    title: 'Verify Customer Phone?',
    description: () =>
      'Are you sure you want to mark this customer\'s phone number as manually verified?',
    confirmLabel: 'Yes, Verify Phone',
    icon: CheckCircle2,
    iconBg: 'bg-teal-100 text-teal-700 border-teal-200',
    confirmBtnClass: 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm',
  },
  UNVERIFY_EMAIL: {
    title: 'Unverify Customer Email?',
    description: (email) =>
      email
        ? `Are you sure you want to mark ${email} as unverified for this customer?`
        : 'Are you sure you want to mark this customer\'s email as unverified?',
    confirmLabel: 'Yes, Unverify',
    icon: MailCheck,
    iconBg: 'bg-amber-100 text-amber-700 border-amber-200',
    confirmBtnClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm',
  },
  UNVERIFY_PHONE: {
    title: 'Unverify Customer Phone?',
    description: () =>
      'Are you sure you want to mark this customer\'s phone number as unverified?',
    confirmLabel: 'Yes, Unverify',
    icon: CheckCircle2,
    iconBg: 'bg-amber-100 text-amber-700 border-amber-200',
    confirmBtnClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm',
  },
};

export default function ConfirmActionModal({
  isOpen,
  actionType,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  customerName,
  customerEmail,
  isProcessing,
  onConfirm,
  onClose,
  reason = '',
  onReasonChange,
  showReasonInput = false,
}: ConfirmActionModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen) return null;

  const meta = ACTION_METAS[actionType];
  const modalTitle = title || meta.title;
  const modalDescription = description || meta.description(customerEmail);
  const modalConfirmLabel = confirmLabel || meta.confirmLabel;
  const IconComponent = meta.icon;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm p-4 flex items-center justify-center animate-fade-in">
      {/* Backdrop click */}
      <div
        className="fixed inset-0 -z-10"
        onClick={() => !isProcessing && onClose()}
      />

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-6 space-y-5 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span
              className={`grid place-items-center h-10 w-10 rounded-2xl border ${meta.iconBg} shadow-xs shrink-0`}
            >
              <IconComponent className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                {modalTitle}
              </h2>
              {actionType === 'DELETE' && (
                <p className="text-[11px] font-semibold text-red-600">
                  Permanent &amp; Irreversible Action
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition"
            title="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Customer Context Info Card */}
        {(customerName || customerEmail) && (
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/70 space-y-2 text-xs">
            {customerName && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 font-medium shrink-0">Customer:</span>
                <span className="font-bold text-slate-900 truncate text-right">
                  {customerName}
                </span>
              </div>
            )}
            {customerEmail && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 font-medium shrink-0">Email:</span>
                <span className="font-mono text-slate-700 font-semibold truncate text-right">
                  {customerEmail}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <p className="text-xs text-slate-600 leading-relaxed">
          {modalDescription}
        </p>

        {/* Optional Reason Input (e.g. for block / audit notes) */}
        {showReasonInput && onReasonChange && (
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-bold text-slate-700">
              Audit Note / Reason (Optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Add optional notes for this administrative action..."
              rows={2}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 disabled:opacity-50 transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl disabled:opacity-50 transition ${meta.confirmBtnClass}`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Processing…</span>
              </>
            ) : (
              <span>{modalConfirmLabel}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
