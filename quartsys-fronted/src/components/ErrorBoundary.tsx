import { Component, ReactNode } from "react";

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, textAlign: "center" }}>
          <p style={{ color: "var(--danger)", fontWeight: 600 }}>页面加载出错</p>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })} style={{ marginTop: 16, padding: "8px 20px", cursor: "pointer" }}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
