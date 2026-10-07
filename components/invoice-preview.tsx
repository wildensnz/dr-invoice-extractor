'use client';

import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

interface InvoicePreviewProps {
  file: File;
}

const ZOOM_STEPS = [1, 1.5, 2, 3];

/** Shows the uploaded image (with zoom) or the PDF in the browser viewer. */
export function InvoicePreview({ file }: InvoicePreviewProps) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const [zoom, setZoom] = useState(0);
  const [lastFile, setLastFile] = useState(file);
  if (file !== lastFile) {
    setLastFile(file);
    setZoom(0);
  }

  const isPdf = file.type === 'application/pdf';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </span>
        {!isPdf && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom out"
              disabled={zoom === 0}
              onClick={() => setZoom((z) => Math.max(0, z - 1))}
            >
              <ZoomOut />
            </Button>
            <span className="w-10 text-center text-xs text-muted-foreground tabular-nums">
              {Math.round(ZOOM_STEPS[zoom] * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom in"
              disabled={zoom === ZOOM_STEPS.length - 1}
              onClick={() =>
                setZoom((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))
              }
            >
              <ZoomIn />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Reset zoom"
              disabled={zoom === 0}
              onClick={() => setZoom(0)}
            >
              <Maximize2 />
            </Button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {isPdf ? (
          <iframe
            src={`${url}#toolbar=0&navpanes=0`}
            title={file.name}
            className="h-full w-full bg-white"
          />
        ) : (
          <div className="flex min-h-full items-start justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob URL, not optimizable */}
            <img
              src={url}
              alt="Uploaded invoice"
              style={{ width: `${ZOOM_STEPS[zoom] * 100}%` }}
              className="max-w-none rounded shadow-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
