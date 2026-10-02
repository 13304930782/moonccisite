import { Component, useEffect, type ReactNode } from 'react';
export function StartupComplete() {
  useEffect(() => { window.dispatchEvent(new Event('mooncci:mounted')); }, []);
  return null;
}
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="startup-shell"><a className="startup-brand" href="/">mooncci</a><main className="startup-body"><h1>页面暂时无法打开</h1><p role="alert">部分页面内容未能加载，请重新加载后再试。</p><button type="button" onClick={() => window.location.reload()}>重新加载</button></main></div>;
    return this.props.children;
  }
}
