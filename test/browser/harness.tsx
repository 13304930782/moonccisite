import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../../src/app/context/AuthContext';
import VisualMarkdownEditor from '../../src/app/components/VisualMarkdownEditor';
function Harness() {
  const auth = useAuth();
  const [content, setContent] = useState('# 浏览器回归\n\n保留正常内容\n\n<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>');
  return <main>
    <p data-testid="user">{auth.loading ? 'loading' : auth.user?.username || 'anonymous'}</p>
    <p role="alert">{auth.logoutError}</p>
    <button onClick={() => void auth.login('browser@example.test', 'BrowserPassword1')}>Login</button>
    <button onClick={() => void auth.logout()} disabled={auth.loggingOut}>Logout</button>
    <VisualMarkdownEditor value={content} onChange={setContent} uploadImage={async () => '/fixture.png'} onError={console.error} onBusy={() => {}} />
    <output data-testid="markdown">{content}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<AuthProvider><Harness /></AuthProvider>);
