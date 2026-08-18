import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import type { OcrFormSpec } from '@/services/ocrApi';

import {
  bindSheetCells,
  collectFormFromDom,
  prepareMergedData,
  renderEditorHtml,
} from './ocrSheetUtils';
import './ocrSheet.css';

export interface OcrSheetEditorHandle {
  collectForm: () => Record<string, unknown> | null;
}

interface OcrSheetEditorProps {
  formSpec: OcrFormSpec;
  merged: Record<string, unknown>;
}

export const OcrSheetEditor = forwardRef<OcrSheetEditorHandle, OcrSheetEditorProps>(
  function OcrSheetEditor({ formSpec, merged }, ref) {
    const formRef = useRef<HTMLFormElement>(null);
    const mergedRef = useRef(prepareMergedData(merged));

    useEffect(() => {
      mergedRef.current = prepareMergedData(merged);
    }, [merged]);

    useImperativeHandle(ref, () => ({
      collectForm: () => {
        if (!formRef.current) return null;
        return collectFormFromDom(formRef.current, mergedRef.current);
      },
    }));

    useEffect(() => {
      const form = formRef.current;
      if (!form) return;
      form.innerHTML = renderEditorHtml(formSpec, mergedRef.current);
      return bindSheetCells(form);
    }, [formSpec, merged]);

    return (
      <div className="ocr-sheet-editor">
        <form ref={formRef} className="edit-form" onSubmit={(e) => e.preventDefault()} />
      </div>
    );
  },
);
