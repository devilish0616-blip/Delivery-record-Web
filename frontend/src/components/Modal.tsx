import type { ReactNode } from "react";

// 共用 Modal：從各頁複製貼上的「fixed inset-0 + bg-black/40 + 置中白色面板」樣式抽出，
// 統一放在這裡供後續改版逐步取代各頁自己手刻的版本（例如取代 window.confirm 的確認彈窗）。
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  if (!open) return null;
  const maxWidth = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 shadow-lg`}>
        {title && <h3 className="mb-2 text-base font-semibold text-gray-800">{title}</h3>}
        <div className="text-sm text-gray-600">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// 常用的「確認 / 取消」型 Modal，取代 window.confirm()
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "確定",
  danger,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {busy ? "處理中..." : confirmLabel}
          </button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
