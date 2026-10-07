'use client';

import { FileText, Image as ImageIcon, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Example } from '@/lib/examples';
import { formatBytes, MAX_FILE_BYTES } from '@/lib/files';
import { cn } from '@/lib/utils';

interface UploadDropzoneProps {
  examples: Example[];
  onFile: (file: File) => void;
  onExample: (example: Example) => void;
  disabled?: boolean;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

export function UploadDropzone({
  examples,
  onFile,
  onExample,
  disabled,
}: UploadDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setLocalError(
        `${file.name} is ${formatBytes(file.size)}; the limit is 5 MB.`,
      );
      return;
    }
    setLocalError(null);
    onFile(file);
  };

  return (
    <div className="flex flex-col gap-6">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) pick(e.dataTransfer.files[0]);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/40',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Upload className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Drop an invoice here or click to choose</p>
          <p className="mt-1 text-sm text-muted-foreground">
            JPEG, PNG, WebP or PDF · up to 5 MB · processed in memory, never
            stored
          </p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>

      {localError && (
        <p role="alert" className="text-sm text-destructive">
          {localError}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Or try one of the synthetic samples:
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {examples.map((example) => (
            <Button
              key={example.id}
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onExample(example)}
              className="h-auto justify-start gap-3 px-3 py-2.5 text-left whitespace-normal"
            >
              {example.mediaType === 'application/pdf' ? (
                <FileText className="text-muted-foreground" />
              ) : (
                <ImageIcon className="text-muted-foreground" />
              )}
              <span className="flex flex-col">
                <span className="font-medium">{example.label}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {example.description}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
