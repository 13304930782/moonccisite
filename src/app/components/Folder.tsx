import { CSSProperties, ReactNode, useState } from 'react';
import './Folder.css';

type FolderProps = {
  color?: string;
  items?: ReactNode[];
  className?: string;
  label?: string;
};

function darkenColor(hex: string, amount: number) {
  const normalized = hex.replace('#', '');
  const value = parseInt(normalized.length === 3 ? normalized.split('').map((part) => part + part).join('') : normalized, 16);
  const channel = (shift: number) => Math.max(0, Math.floor(((value >> shift) & 255) * (1 - amount)));
  return `#${[channel(16), channel(8), channel(0)].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

export function Folder({ color = '#ffe17c', items = [], className = '', label = '打开文件夹' }: FolderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const papers = [...items.slice(0, 3), null, null, null].slice(0, 3);
  const style = {
    '--folder-color': color,
    '--folder-back-color': darkenColor(color, 0.13),
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`folder ${isOpen ? 'is-open' : ''} ${className}`}
      style={style}
      onClick={() => setIsOpen((open) => !open)}
      aria-expanded={isOpen}
      aria-label={isOpen ? '收起文件夹' : label}
    >
      <span className="folder-back">
        {papers.map((item, index) => (
          <span key={index} className={`folder-paper folder-paper-${index + 1}`}>
            {item}
          </span>
        ))}
        <span className="folder-front folder-front-left" />
        <span className="folder-front folder-front-right" />
      </span>
    </button>
  );
}
