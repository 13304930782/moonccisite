import { useEffect, useRef } from 'react';
import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/i18n/zh-cn';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';
import '../../styles/article-editor.css';

export default function VisualMarkdownEditor({
  value,
  onChange,
  uploadImage,
  onError,
  onBusy,
}: {
  value: string;
  onChange: (value: string) => void;
  uploadImage: (file: File) => Promise<string>;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    instance = useRef<Editor | null>(null);
  const props = useRef({ value, onChange, uploadImage, onError, onBusy });
  props.current = { value, onChange, uploadImage, onError, onBusy };
  const externalUpdate = useRef(false),
    lastValue = useRef(value);
  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    externalUpdate.current = true;
    const editor = new Editor({
      el: host.current,
      initialValue: props.current.value,
      initialEditType: 'wysiwyg',
      height: '560px',
      language: 'zh-CN',
      hideModeSwitch: true,
      autofocus: false,
      usageStatistics: false,
      referenceDefinition: true,
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task'],
        ['table', 'image', 'link'],
        ['code', 'codeblock'],
      ],
      linkAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      hooks: {
        addImageBlobHook: async (blob, callback) => {
          props.current.onBusy(true);
          try {
            const file =
              blob instanceof File
                ? blob
                : new File([blob], 'pasted-image.png', {
                    type: blob.type || 'image/png',
                  });
            const url = await props.current.uploadImage(file);
            if (alive) callback(url, file.name);
          } catch (e: any) {
            if (alive) props.current.onError(e.message || '图片上传失败');
          } finally {
            props.current.onBusy(false);
          }
        },
      },
    });
    instance.current = editor;
    lastValue.current = props.current.value;
    externalUpdate.current = false;
    editor.on('change', () => {
      if (externalUpdate.current || !alive) return;
      const next = editor.getMarkdown();
      lastValue.current = next;
      props.current.onChange(next);
    });
    const theme = () =>
      host.current
        ?.querySelector('.toastui-editor-defaultUI')
        ?.classList.toggle(
          'toastui-editor-dark',
          document.documentElement.classList.contains('dark'),
        );
    theme();
    const observer = new MutationObserver(theme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => {
      alive = false;
      observer.disconnect();
      editor.destroy();
      instance.current = null;
    };
  }, []);
  useEffect(() => {
    if (instance.current && value !== lastValue.current) {
      externalUpdate.current = true;
      instance.current.setMarkdown(value, false);
      lastValue.current = value;
      externalUpdate.current = false;
    }
  }, [value]);
  return (
    <div className="visual-editor" ref={host} aria-label="可视化文章编辑器" />
  );
}
