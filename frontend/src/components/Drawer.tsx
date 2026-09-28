import type { ReactNode } from "react";
import { X } from "lucide-react";

// 共用右側滑出面板，取代過去用行內 <tr> 展開塞資訊的做法。
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  widthClass = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full ${widthClass} flex-col bg-white shadow-2xl transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {open && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">{title}</div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="border-t border-gray-200 px-5 py-3">{footer}</div>}
          </>
        )}
      </div>
    </>
  );
}
