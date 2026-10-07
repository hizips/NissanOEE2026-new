/** Build-time replacement for the OCR API client in OCR-free deployments. */

export async function fetchOcrBlobUrl(): Promise<string> {
  throw new Error('OCR is disabled for this deployment');
}

export const ocrApi = {
  async getJob(): Promise<{ pdfPage?: number }> {
    throw new Error('OCR is disabled for this deployment');
  },
};
