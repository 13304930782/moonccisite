import { ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';
import { markChunkErrorHandled } from '../lib/recoverableChunk';
import { useLocale } from '../context/LocaleContext';
import { useI18n } from '../i18n';
import '../../styles/language-switch.css';

let menuRequest: Promise<typeof import('./LanguageMenu')> | undefined;
function loadMenu() {
  return menuRequest ||= import('./LanguageMenu').catch(error => { markChunkErrorHandled(error); menuRequest = undefined; throw error; });
}

export function LanguageSwitch() {
  const { preference, setLocale, languageError } = useLocale();
  const { t } = useI18n();
  const [Menu, setMenu] = useState<typeof import('./LanguageMenu').default>();
  const [open, setOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [menuError, setMenuError] = useState(false);
  const intent = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const preload = () => { void loadMenu().catch(() => {}); };
  const activate = async (keyboard = false) => {
    const request = ++intent.current;
    setMenuError(false);
    try {
      const module = await loadMenu();
      if (request !== intent.current || !triggerRef.current) return;
      setMenu(() => module.default);
      setKeyboardOpen(keyboard);
      setOpen(true);
    } catch { if (request === intent.current) setMenuError(true); }
  };
  const options = [{ value: 'zh-CN', label: t("m_72726d8818") }, { value: 'en', label: 'English' }, { value: 'system', label: t("m_217cfe7db1") }] as const;
  return <div className="language-switch">
    {Menu ? <Menu keyboardOpen={keyboardOpen} open={open} onOpenChange={setOpen} options={options} value={preference} onChange={value => setLocale(value as 'zh-CN' | 'en' | 'system')} trigger={<button type="button" className="language-trigger" aria-label={t("m_3d13868593")}><span>{options.find(option => option.value === preference)?.label}</span><ChevronDown size={16} aria-hidden="true" /></button>} />
      : menuError ? <select autoFocus className="language-trigger" aria-label={t('m_3d13868593')} value={preference} onChange={event => setLocale(event.target.value as 'zh-CN' | 'en' | 'system')}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select> : <button ref={triggerRef} type="button" className="language-trigger" aria-label={t("m_3d13868593")} aria-haspopup="menu" aria-expanded={false}
        onPointerEnter={preload} onFocus={preload} onBlur={() => { intent.current++; }} onClick={() => void activate()}
        onKeyDown={event => { if (['ArrowDown','Enter',' '].includes(event.key)) { event.preventDefault(); void activate(true); } else if (event.key === 'Escape') intent.current++; }}>
        <span>{options.find(option => option.value === preference)?.label}</span><ChevronDown size={16} aria-hidden="true" />
      </button>}
    {menuError && <span role="alert">{t('m_fcbfcd21a1')}</span>}
    {languageError && <span role="alert">{languageError}<button type="button" onClick={() => setLocale(preference)}>{t("m_b8784c8dd5")}</button></span>}
  </div>;
}
