import { useMemo } from 'react';

interface PdfDocumentViewerProps {
  src: string;
  page?: number;
  className?: string;
  title?: string;
}

function pdfViewerUrl(src: string, page: number): string {
  const baseUrl = src.split('#', 1)[0];
  const safePage = Math.max(1, Math.trunc(page) || 1);
  return `${baseUrl}#page=${safePage}&zoom=page-width&toolbar=1&navpanes=0`;
}

export function PdfDocumentViewer({
  src,
  page = 1,
  className = '',
  title = 'PDF document',
}: PdfDocumentViewerProps) {
  const viewerUrl = useMemo(() => pdfViewerUrl(src, page), [page, src]);

  return (
    <div className={`overflow-hidden bg-slate-100 ${className}`}>
      <iframe
        key={viewerUrl}
        src={viewerUrl}
        title={title}
        className="block h-full min-h-[480px] w-full border-0 bg-white"
      />
    </div>
  );
}
