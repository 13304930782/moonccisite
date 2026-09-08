import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export function ElectricityRssSubscription({ roomId }: { roomId: string }) {
  const { user } = useAuth();
  return user ? (
    <RoomElectricityRssSubscription
      key={`${user.id}:${roomId}`}
      roomId={roomId}
    />
  ) : null;
}
function RoomElectricityRssSubscription({ roomId }: { roomId: string }) {
  const [data, setData] = useState<{
    url: string | null;
    resetRequired: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useCallback(
    async (action = '') => {
      setBusy(true);
      setError('');
      setMessage('');
      try {
        const response = await api(
          `/electricity/rss/subscription${action === 'reset' ? '/reset' : ''}?roomId=${encodeURIComponent(roomId)}`,
          { method: action ? 'POST' : 'GET', cache: 'no-store' },
        );
        setData(response.data);
        setConfirming(false);
        if (action)
          setMessage(
            action === 'reset'
              ? '链接已重置，请在阅读器中更新订阅地址。'
              : '订阅链接已创建。',
          );
      } catch (e) {
        setError(e instanceof Error ? e.message : '暂时无法读取订阅链接。');
      } finally {
        setBusy(false);
      }
    },
    [roomId],
  );
  useEffect(() => {
    void request();
  }, [request]);
  async function copy() {
    if (!data?.url) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setMessage('订阅链接已复制。');
    } catch {
      input.current?.focus();
      input.current?.select();
      setMessage('请复制已选中的完整订阅链接。');
    }
  }
  return (
    <section
      className="electricity-rss"
      aria-labelledby="electricity-rss-heading"
      aria-busy={busy}
    >
      <h2 id="electricity-rss-heading">私密 RSS 订阅</h2>
      <p>每天早晚更新，实际到达时间取决于阅读器刷新频率。</p>
      <p>此链接包含私人电量信息，请勿公开分享。</p>
      {busy && !data && <p role="status">正在读取订阅状态…</p>}
      {data?.url && (
        <div className="electricity-rss-copy">
          <label className="electricity-rss-link">
            <span>订阅地址</span>
            <input
              ref={input}
              value={data.url}
              readOnly
              autoComplete="off"
              spellCheck={false}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button
            className="electricity-button"
            type="button"
            disabled={busy}
            onClick={copy}
          >
            复制订阅链接
          </button>
        </div>
      )}
      {data?.resetRequired && <p>订阅密钥已变更，请重置链接后重新订阅。</p>}
      <div className="electricity-rss-actions">
        {data && !data.url && !data.resetRequired && (
          <button
            className="electricity-button"
            type="button"
            disabled={busy}
            onClick={() => request('create')}
          >
            创建订阅链接
          </button>
        )}
        {data && (data.url || data.resetRequired) && !confirming && (
          <button
            className="electricity-button"
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            重置订阅链接
          </button>
        )}
        {error && (
          <button
            className="electricity-button"
            type="button"
            disabled={busy}
            onClick={() => request()}
          >
            重新读取
          </button>
        )}
      </div>
      {confirming && (
        <div className="electricity-rss-confirm">
          <p>重置后，旧链接将立即失效。你需要在阅读器中换成新链接。</p>
          <div className="electricity-rss-actions">
            <button
              className="electricity-button"
              type="button"
              disabled={busy}
              onClick={() => request('reset')}
            >
              {busy ? '正在重置…' : '确认重置'}
            </button>
            <button
              className="electricity-button"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
