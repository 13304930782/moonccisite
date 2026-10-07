import {renderToPipeableStream} from 'react-dom/server';
import {PassThrough} from 'node:stream';
import App from '../../src/app/App';
import {AppErrorBoundary, StartupComplete} from '../../src/app/components/AppErrorBoundary';
import '../../src/styles/index.css';
import '../../src/styles/motion.css';

function render(url: string, data: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let failed: unknown;
    const output = new PassThrough();
    let html = '';
    output.setEncoding('utf8');
    output.on('data', chunk => { html += chunk; });
    output.on('end', () => { clearTimeout(timer); failed ? reject(failed) : resolve(html); });
    output.on('error', reject);
    const stream = renderToPipeableStream(<AppErrorBoundary><App url={url} documentData={data}/><StartupComplete/></AppErrorBoundary>, {
      onAllReady() { stream.pipe(output); },
      onError(error) { failed = error; },
      onShellError(error) { clearTimeout(timer); reject(error); },
    });
    const timer = setTimeout(() => { stream.abort(); reject(new Error('Document render timed out')); }, 10000);
  });
}
export async function renderDocument(url: string, load: (path: string) => Promise<any>, status = 200) {
  const data: any = {resources: {}, errors: {}, status, url};
  for (let pass = 0; pass < 5; pass++) {
    const collect = new Set<string>();
    const html = await render(url, {...data, collect});
    const missing = [...collect].filter(path => !(path in data.resources) && !(path in data.errors));
    if (!missing.length) return {html, data};
    await Promise.all(missing.map(async path => {
      try { data.resources[path] = await load(path); }
      catch (error: any) { if(error.status === 404) data.errors[path] = 404; else throw error; }
    }));
  }
  throw new Error('Document dependencies did not settle');
}
