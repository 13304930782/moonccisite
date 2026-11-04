import { translate } from '../i18n';
import { Component, useEffect, type ReactNode } from 'react';
export function StartupComplete() {
  useEffect(() => { window.dispatchEvent(new Event('mooncci:mounted')); }, []);
  return null;
}
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    const locale = typeof document !== 'undefined' && document.documentElement.lang.startsWith('en') ? 'en' : 'zh-CN';
    const t = (key: string) => translate(locale, key);
    if (this.state.failed) return <div className="startup-shell"><a className="startup-brand" href="/">mooncci</a><main className="startup-body"><h1>{t("m_695095eaf9")}</h1><p role="alert">{t("m_8f7777cd08")}</p><button type="button" onClick={() => window.location.reload()}>{t("m_7bdd5ce1e2")}</button></main></div>;
    return this.props.children;
  }
}
