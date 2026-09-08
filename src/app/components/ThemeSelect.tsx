import {
  Children,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ComponentPropsWithoutRef,
} from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

type Props = Omit<
  ComponentPropsWithoutRef<typeof Select.Trigger>,
  'value' | 'onChange' | 'children'
> & {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
  name?: string;
};

// Retain the existing option labels and values while theming the entire popup.
export function ThemeSelect({
  value,
  onValueChange,
  children,
  required,
  name,
  disabled,
  className = '',
  ...props
}: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const [invalid, setInvalid] = useState(false);
  const options = Children.toArray(children).filter(
    isValidElement<{ value: string; children: ReactNode; disabled?: boolean }>,
  );
  const placeholder = options.find((option) => option.props.value === '')?.props
    .children;
  return (
    <span
      className="theme-select-field"
      onInvalidCapture={(event) => {
        event.preventDefault();
        setInvalid(true);
        const form = trigger.current?.closest('form');
        if (form?.querySelector(':invalid') === event.target)
          queueMicrotask(() => trigger.current?.focus());
      }}
    >
      <Select.Root
        value={value}
        onValueChange={(nextValue) => {
          setInvalid(false);
          onValueChange(nextValue);
        }}
        disabled={disabled}
      >
        <Select.Trigger
          {...props}
          ref={trigger}
          className={`theme-select-trigger ${className}`}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : props['aria-describedby']}
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon asChild>
            <ChevronDown size={16} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="theme-select-menu"
            position="popper"
            sideOffset={6}
            collisionPadding={16}
          >
            <Select.ScrollUpButton className="theme-select-scroll">
              <ChevronUp size={16} />
            </Select.ScrollUpButton>
            <Select.Viewport className="theme-select-viewport">
              {options
                .filter((option) => option.props.value !== '')
                .map((option) => (
                  <Select.Item
                    key={option.props.value}
                    value={option.props.value}
                    disabled={option.props.disabled}
                    className="theme-select-option"
                  >
                    <Select.ItemText>{option.props.children}</Select.ItemText>
                    <Select.ItemIndicator className="theme-select-check">
                      <Check size={15} />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="theme-select-scroll">
              <ChevronDown size={16} />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <select
        className="theme-select-native"
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          setInvalid(false);
          onValueChange(event.target.value);
        }}
      >
        {children}
      </select>
      {invalid && (
        <span id={errorId} className="theme-select-error" role="alert">
          请选择一项。
        </span>
      )}
    </span>
  );
}
