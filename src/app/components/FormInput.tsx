import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

/** Keep native form constraints while presenting the remedy beside the field. */
export const FormInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function FormInput({ onInvalid, onChange, ...props }, ref) {
  const id = useId();
  const [error, setError] = useState('');
  return <><input {...props} ref={ref} aria-invalid={error ? true : props['aria-invalid']}
    aria-describedby={[props['aria-describedby'], error ? id : ''].filter(Boolean).join(' ') || undefined}
    onInvalid={event => {
      onInvalid?.(event); event.preventDefault();
      const input = event.currentTarget, validity = input.validity;
      setError(validity.valueMissing ? '请填写这一项。' : validity.typeMismatch && input.type === 'email' ? '请填写完整的邮箱地址，例如 name@example.com。' : validity.tooShort ? `请至少填写 ${input.minLength} 个字符。` : validity.rangeUnderflow ? `请输入不小于 ${input.min} 的数值。` : validity.rangeOverflow ? `请输入不大于 ${input.max} 的数值。` : input.validationMessage);
      if (input.form?.querySelector(':invalid') === input) queueMicrotask(() => input.focus());
    }}
    onChange={event => { if (event.currentTarget.validity.valid) setError(''); onChange?.(event); }}/>
    {error && <span id={id} className="experience-field-error" role="alert">{error}</span>}
  </>;
});
