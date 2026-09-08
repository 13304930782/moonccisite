// Toast UI 3.2.2 embeds DOMPurify 2.3.3 even in its ESM build. A dependency
// override alone cannot replace that code. Keep every internal sanitizer call
// (including paste/DOM-fragment paths) wired to the maintained package.
export function replaceEditorSanitizer(source) {
  const start = source.indexOf('/*! @license DOMPurify 2.3.3');
  const marker = 'var purify = createDOMPurify();';
  const end = source.indexOf(marker, start);
  if (start < 0 || end < start || source.indexOf(marker, end + marker.length) !== -1) {
    throw new Error('Toast UI embedded sanitizer changed; review the security adapter before building.');
  }
  return source.slice(0, start) + "import purify from 'dompurify';\n" + source.slice(end + marker.length);
}
export function editorSanitizerPlugin() {
  return {
    name: 'mooncci-editor-sanitizer',
    enforce: 'pre',
    transform(source, id) {
      if (/\/@toast-ui\/editor\/dist\/esm\/index(?:Viewer)?\.js$/.test(id.replaceAll('\\', '/'))) {
        return { code: replaceEditorSanitizer(source), map: null };
      }
    },
  };
}
