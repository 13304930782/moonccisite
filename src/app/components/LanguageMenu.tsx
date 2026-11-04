import type { ReactElement } from 'react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from './ui/dropdown-menu';

export default function LanguageMenu({ trigger, options, value, onChange, open, onOpenChange, keyboardOpen }: {
  trigger: ReactElement;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyboardOpen: boolean;
}) {
  return <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent className="language-menu" align="end" sideOffset={8} onFocusCapture={event => {
      if (keyboardOpen && event.target === event.currentTarget) { event.currentTarget.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus(); }
    }} onEscapeKeyDown={event => event.stopPropagation()}>
      <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
        {options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
