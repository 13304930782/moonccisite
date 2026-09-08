import { useEffect, useRef, useState } from 'react';

const DEFAULT_GOOGLE_CLIENT_ID = '614401761904-4g7soo2d1clsnui71h5tb9ia4j1t530m.apps.googleusercontent.com';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
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

    const onLoad = () => resolve();
    const onError = () => {
      googleScriptPromise = null;
      reject(new Error('Google 登录服务暂时无法加载。'));
    };

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
  context?: 'signin' | 'signup';
  disabled?: boolean;
  onCredential: (credential: string) => void | Promise<void>;
  onError: (message: string) => void;
};

export function GoogleSignInButton({
  context = 'signin',
  disabled = false,
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const credentialHandler = useRef(onCredential);
  const errorHandler = useRef(onError);
  const [scriptReady, setScriptReady] = useState(false);

  credentialHandler.current = onCredential;
  errorHandler.current = onError;

  useEffect(() => {
    let active = true;

    loadGoogleIdentityScript()
      .then(() => {
        if (!active) return;
        setScriptReady(true);
      })
      .catch((error) => {
        if (!active) return;
        errorHandler.current(error.message || 'Google 登录服务暂时无法加载。');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const googleIdentity = window.google?.accounts?.id;
    const host = hostRef.current;
    if (!scriptReady || !googleIdentity || !host) return;

    googleIdentity.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
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

    host.replaceChildren();
    googleIdentity.renderButton(host, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: context === 'signup' ? 'signup_with' : 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: Math.min(400, Math.max(240, Math.floor(host.clientWidth || 320))),
      locale: 'zh-CN',
    });
  }, [context, scriptReady]);

  return (
    <div className={`auth-google-button ${disabled ? 'is-disabled' : ''}`} aria-busy={disabled}>
      <div ref={hostRef} className="auth-google-button-host" />
      {!scriptReady && <span className="auth-google-loading">正在加载 Google 登录…</span>}
    </div>
  );
}
