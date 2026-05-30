"use client";
import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDangerous = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative z-50 bg-dark-900 border border-dark-600 rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          {isDangerous && (
            <div className="flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
          </div>
        </div>

        {/* Message */}
        <div className="text-sm text-gray-300 mb-6 leading-relaxed">
          {message}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={confirming || isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-dark-800 border border-dark-600 rounded-lg hover:bg-dark-700 transition-all disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming || isLoading}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50 ${
              isDangerous
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {confirming ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
