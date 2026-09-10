import { useEffect, useRef, useState } from 'react';

const GOOGLE_SCRIPT_ID = 'google-identity-services';

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentityApi = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: 'signin' | 'signup' | 'use';
    ux_mode?: 'popup' | 'redirect';
  }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleIdentityApi;
      };
    };
  }
}

let googleScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing || document.createElement('script');

    const cleanup = () => {
      clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const onLoad = () => {
      if (!window.google?.accounts?.id) { onError(); return; }
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      script.remove();
      googleScriptPromise = null;
      reject(new Error('暂时无法连接 Google，请重试或使用其他登录方式。'));
    };
    const timer = setTimeout(onError, 10000);

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existing) {
      script.id = GOOGLE_SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client?hl=zh-CN';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return googleScriptPromise;
}

type GoogleSignInButtonProps = {
  clientId: string;
  context?: 'signin' | 'signup';
  disabled?: boolean;
  onCredential: (credential: string) => void | Promise<void>;
  onError: (message: string) => void;
};

export function GoogleSignInButton({
  clientId,
  context = 'signin',
  disabled = false,
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const credentialHandler = useRef(onCredential);
  const errorHandler = useRef(onError);
  const [scriptReady, setScriptReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('');
  const [nativeReady, setNativeReady] = useState(false);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  credentialHandler.current = onCredential;
  errorHandler.current = onError;

  useEffect(() => {
    let active = true;
    setStatus('');

    loadGoogleIdentityScript()
      .then(() => {
        if (!active) return;
        setScriptReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setStatus(error.message || '暂时无法连接 Google，请重试。');
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    const googleIdentity = window.google?.accounts?.id;
    const host = hostRef.current;
    if (!scriptReady || !googleIdentity || !host) return;

    googleIdentity.initialize({
      client_id: clientId,
      callback: (response) => {
        if (disabledRef.current) return;
        if (!response.credential) {
          errorHandler.current('Google 没有返回可用的登录凭证。');
          return;
        }
        void credentialHandler.current(response.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      context,
      ux_mode: 'popup',
    });

    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const frames = new Set<HTMLIFrameElement>();
    const ready = () => {
      if (!active) return;
      clearTimeout(timer);
      setNativeReady(true);
      setStatus('');
    };
    const watchFrames = () => {
      host.querySelectorAll('iframe').forEach(frame => {
        if (frames.has(frame)) return;
        frames.add(frame);
        frame.addEventListener('load', ready);
      });
    };
    const render = () => {
      clearTimeout(timer);
      frames.forEach(frame => frame.removeEventListener('load', ready));
      frames.clear();
      setNativeReady(false);
      host.replaceChildren();
      googleIdentity.renderButton(host, {
        type: 'standard',
        theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
        size: 'large',
        text: context === 'signup' ? 'signup_with' : 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(400, Math.floor(host.clientWidth || 320)),
        locale: 'zh-CN',
      });
      watchFrames();
      timer = setTimeout(() => {
        if (active) setStatus('Google 加载较慢，可以重试或使用其他登录方式。');
      }, 10000);
    };
    const observer = new MutationObserver(watchFrames);
    observer.observe(host, { childList: true, subtree: true });
    render();
    const themeObserver = new MutationObserver(render);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-moon-theme'] });
    let width = host.clientWidth;
    const resizeObserver = new ResizeObserver(() => {
      if (width === host.clientWidth) return;
      width = host.clientWidth;
      render();
    });
    resizeObserver.observe(host);
    return () => {
      active = false;
      clearTimeout(timer);
      observer.disconnect();
      themeObserver.disconnect();
      resizeObserver.disconnect();
      frames.forEach(frame => frame.removeEventListener('load', ready));
    };
  }, [context, scriptReady, clientId, attempt]);

  return (
    <div className={`auth-google-button ${disabled ? 'is-disabled' : ''}`} aria-busy={disabled}>
      <div className="auth-google-slot">
        <div ref={hostRef} className="auth-google-button-host"
          style={{ visibility: nativeReady ? 'visible' : 'hidden', pointerEvents: disabled ? 'none' : undefined }}
          {...({ inert: disabled || !nativeReady ? '' : undefined } as Record<string, string | undefined>)} />
        {!nativeReady && <button type="button" className="auth-google-local" disabled={disabled}
          onClick={() => {
            if (status) setAttempt(value => value + 1);
            setStatus('正在连接 Google，就绪后请点击按钮继续。');
          }}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
            <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
          </svg>
          <span>{context === 'signup' ? '通过 Google 注册' : '通过 Google 继续操作'}</span>
        </button>}
      </div>
      {status && <p className="auth-google-status" role="status">{status}</p>}
    </div>
  );
}
