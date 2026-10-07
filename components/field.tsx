'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Check } from '@/lib/validate';

/** Amber ring for fields the validator flagged. */
export const warningClass =
  'border-amber-500 ring-3 ring-amber-500/25 focus-visible:border-amber-600 focus-visible:ring-amber-500/40';

/** Small status icon with the validator message in a tooltip. */
export function CheckIcon({ check }: { check?: Check }) {
  if (!check) return null;
  const warning = check.status === 'warning';
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={check.message}
        className="inline-flex cursor-help items-center"
      >
        {warning ? (
          <TriangleAlert className="size-3.5 text-amber-600" />
        ) : (
          <CircleCheck className="size-3.5 text-emerald-600" />
        )}
      </TooltipTrigger>
      <TooltipContent>{check.message}</TooltipContent>
    </Tooltip>
  );
}

interface FieldShellProps {
  label: string;
  check?: Check;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function FieldShell({
  label,
  check,
  htmlFor,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        <CheckIcon check={check} />
      </div>
      {children}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  check?: Check;
  type?: 'text' | 'date';
  placeholder?: string;
  mono?: boolean;
  className?: string;
}

export function TextField({
  label,
  value,
  onChange,
  check,
  type = 'text',
  placeholder,
  mono,
  className,
}: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} check={check} htmlFor={id} className={className}>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          mono && 'font-mono',
          check?.status === 'warning' && warningClass,
        )}
      />
    </FieldShell>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  warning?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * Text input that keeps what the user is typing ("12.") and commits the
 * parsed number as soon as it is valid. Reformats on blur.
 */
export function NumberInput({
  value,
  onChange,
  warning,
  className,
  id,
  'aria-label': ariaLabel,
}: NumberInputProps) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        const parsed = Number(next);
        if (next.trim() !== '' && Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => setText(String(value))}
      className={cn(
        'text-right tabular-nums',
        warning && warningClass,
        className,
      )}
    />
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  check?: Check;
  hint?: string;
  className?: string;
}

export function NumberField({
  label,
  value,
  onChange,
  check,
  hint,
  className,
}: NumberFieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} check={check} htmlFor={id} className={className}>
      <NumberInput
        id={id}
        value={value}
        onChange={onChange}
        warning={check?.status === 'warning'}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </FieldShell>
  );
}
