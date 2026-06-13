import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// 全域錯誤邊界：避免任何頁面 render 階段發生例外時，整個畫面變成空白
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("頁面發生錯誤：", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
          <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-red-600">頁面發生錯誤</h1>
            <p className="mt-2 text-sm text-gray-600">
              畫面顯示時發生問題，請重新整理頁面再試一次。若問題持續發生，請聯絡系統管理者。
            </p>
            <p className="mt-3 break-all text-xs text-gray-400">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              重新整理
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
