import './FloatingField.css';
import { useI18n } from '../i18n';
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

/** Keep native form constraints while presenting the remedy beside the field. */
export const FormInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & {validateOnBlur?:boolean}>(function FormInput({ onInvalid, onChange, onBlur, validateOnBlur, ...props }, ref) {
  const { t } = useI18n();
  const id = useId();
  const [error, setError] = useState('');
  return <><input {...props} ref={ref} aria-invalid={error ? true : props['aria-invalid']}
    aria-describedby={[props['aria-describedby'], error ? id : ''].filter(Boolean).join(' ') || undefined}
    onInvalid={event => {
      onInvalid?.(event); event.preventDefault();
      const input = event.currentTarget, validity = input.validity;
      setError(validity.valueMissing ? t("m_fe0363e354") : validity.typeMismatch && input.type === 'email' ? t("m_d4650e6ec8") : validity.tooShort ? t("m_c5049b596d", {v0: input.minLength}) : validity.rangeUnderflow ? t("m_6721fc64aa", {v0: input.min}) : validity.rangeOverflow ? t("m_d4e7a01f89", {v0: input.max}) : input.validationMessage);
      if (input.form?.querySelector(':invalid') === input) queueMicrotask(() => input.focus());
    }}
    onBlur={event => {if(validateOnBlur && event.currentTarget.value && event.currentTarget.validity.typeMismatch)setError(t("m_d4650e6ec8")); onBlur?.(event);}}
    onChange={event => { if (event.currentTarget.validity.valid) setError(''); onChange?.(event); }}/>
    {error && <span id={id} className="experience-field-error" role="alert">{t(error || '')}</span>}
  </>;
});
