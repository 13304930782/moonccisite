import { Children, isValidElement, type ReactNode } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';

type Props = {
  value: string;
  onChange(event: { target: { value: string } }): void;
  children: ReactNode;
  'aria-label': string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
};

export default function FestivalSelect({ value, onChange, children, 'aria-label': label, disabled, required, name }: Props) {
  return <Select value={value} onValueChange={value => onChange({ target: { value } })} disabled={disabled} required={required} name={name}>
    <SelectTrigger className="fv-select" aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent className="fest-v2 fv-select-menu">
      {Children.toArray(children).filter(isValidElement<{ value: string; disabled?: boolean; children: ReactNode }>).map(option =>
        <SelectItem key={option.props.value} value={option.props.value} disabled={option.props.disabled}>{option.props.children}</SelectItem>)}
    </SelectContent>
  </Select>;
}
