import { ReactNode } from 'react';
import { safeHref, safeImageSrc } from '../lib/safeUrl';

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderInline(text: string) {
  let html = escapeHtml(text);

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const safeAlt = escapeHtml(alt);
    const safeUrl = safeImageSrc(url);

    if (!safeUrl) return '';

    return `<img src="${escapeHtml(safeUrl)}" alt="${safeAlt}" class="my-6 max-h-[520px] w-full rounded-3xl object-cover shadow-lg" />`;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safeLabel = escapeHtml(label);
    const rawUrl = String(url || '').trim();
    const safeUrl = safeHref(rawUrl);

    if (!safeUrl || /^javascript:/i.test(rawUrl) || /^data:/i.test(rawUrl) || /^vbscript:/i.test(rawUrl)) {
      return safeLabel;
    }

    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${safeLabel}</a>`;
  });

  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-gray-950 dark:text-white">$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code class="rounded-md bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-sm">$1</code>');

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function MarkdownContent({ content }: { content: string }) {
  const lines = String(content || '').split('\n');
  const nodes: ReactNode[] = [];
  let codeBuffer: string[] = [];
  let inCode = false;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();

    if (line.trim().startsWith('```')) {
      if (inCode) {
        nodes.push(
          <pre key={`code-${index}`} className="my-6 overflow-x-auto rounded-2xl bg-gray-950 px-5 py-4 text-sm text-gray-100">
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer = [];
        inCode = false;
      } else {
        inCode = true;
      }

      return;
    }

    if (inCode) {
      codeBuffer.push(rawLine);
      return;
    }

    if (!line.trim()) {
      nodes.push(<div key={`space-${index}`} className="h-3" />);
      return;
    }

    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={index} className="mt-10 mb-5 text-4xl font-bold text-gray-950 dark:text-white">
          {renderInline(line.slice(2))}
        </h1>
      );
      return;
    }

    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={index} className="mt-9 mb-4 text-3xl font-bold text-gray-950 dark:text-white">
          {renderInline(line.slice(3))}
        </h2>
      );
      return;
    }

    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={index} className="mt-7 mb-3 text-2xl font-semibold text-gray-950 dark:text-white">
          {renderInline(line.slice(4))}
        </h3>
      );
      return;
    }

    if (line.startsWith('> ')) {
      nodes.push(
        <blockquote key={index} className="my-5 border-l-4 border-blue-500 bg-blue-50/70 dark:bg-blue-900/20 px-5 py-3 text-gray-700 dark:text-gray-200">
          {renderInline(line.slice(2))}
        </blockquote>
      );
      return;
    }

    if (/^[-*]\s+/.test(line)) {
      nodes.push(
        <div key={index} className="ml-4 flex gap-3 text-lg leading-9 text-gray-800 dark:text-gray-200">
          <span>-</span>
          <span>{renderInline(line.replace(/^[-*]\s+/, ''))}</span>
        </div>
      );
      return;
    }

    nodes.push(
      <p key={index} className="mb-5 text-lg leading-9 text-gray-800 dark:text-gray-200">
        {renderInline(line)}
      </p>
    );
  });

  if (codeBuffer.length) {
    nodes.push(
      <pre key="code-final" className="my-6 overflow-x-auto rounded-2xl bg-gray-950 px-5 py-4 text-sm text-gray-100">
        <code>{codeBuffer.join('\n')}</code>
      </pre>
    );
  }

  return <div className="mt-10 max-w-none">{nodes}</div>;
}
