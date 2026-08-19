"use client";

interface DeletionModalProps {
  adminName: string;
  onApprove: () => void;
  onReject: () => void;
}

export function DeletionModal({ adminName, onApprove, onReject }: DeletionModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Project deletion request</h2>
        <p className="mt-2 text-sm text-slate-600">
          {adminName} wants to delete this project. In case you have your progress here, you can
          cancel the request of deletion.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onReject}
            title="Cancel the deletion request"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500 text-white transition-colors hover:bg-rose-600"
          >
            <span className="text-xl leading-none">✕</span>
          </button>
          <button
            onClick={onApprove}
            title="Approve the deletion"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-600"
          >
            <span className="text-xl leading-none">✓</span>
          </button>
        </div>
      </div>
    </div>
  );
}
