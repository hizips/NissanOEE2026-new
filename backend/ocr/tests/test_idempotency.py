from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.test import SimpleTestCase

from ocr.pipeline import jobs
from ocr.scripts import dual_extract, ocr_pipeline


class OcrStartIdempotencyTests(SimpleTestCase):
    @patch('ocr.pipeline.jobs.start_job_thread')
    @patch('ocr.pipeline.jobs.create_job')
    @patch('ocr.pipeline.uploads.read_upload_meta')
    def test_same_request_and_pages_produce_same_job_ids(
        self,
        read_upload_meta,
        create_job,
        start_job_thread,
    ):
        read_upload_meta.return_value = {
            'original_filename': 'sheet.pdf',
            'page_count': 2,
            'source_key': 'sources/hash.pdf',
            'content_sha256': 'hash',
        }
        create_job.side_effect = lambda _name, **kwargs: {
            'id': kwargs['job_id'],
            'status': 'queued',
        }

        first = jobs.start_jobs_from_upload(
            'upl-hash',
            [1, 2],
            request_id='request-12345678',
        )
        second = jobs.start_jobs_from_upload(
            'upl-hash',
            [2, 1],
            request_id='request-12345678',
        )

        self.assertEqual([job['id'] for job in first], [job['id'] for job in second])
        self.assertEqual(start_job_thread.call_count, 4)

    @patch('ocr.pipeline.uploads.read_upload_meta')
    def test_rejects_missing_request_id(self, read_upload_meta):
        read_upload_meta.return_value = {
            'original_filename': 'sheet.pdf',
            'page_count': 1,
            'source_key': 'sources/hash.pdf',
            'content_sha256': 'hash',
        }

        with self.assertRaisesMessage(ValueError, 'valid OCR request ID'):
            jobs.start_jobs_from_upload('upl-hash', [1], request_id='')


class DatalabResumeTests(SimpleTestCase):
    def test_convert_resumes_saved_submission_without_posting_again(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf = root / 'input.pdf'
            pdf.write_bytes(b'%PDF-test')
            (root / '11_convert_submit.json').write_text(
                json.dumps({'request_id': 'convert-1', 'request_check_url': 'https://check/convert-1'}),
                encoding='utf-8',
            )
            result = {
                'status': 'complete',
                'success': True,
                'checkpoint_id': 'checkpoint-1',
            }

            with (
                patch.object(ocr_pipeline, 'http_json') as post,
                patch.object(ocr_pipeline, 'poll_result', return_value=result) as poll,
            ):
                returned = ocr_pipeline.run_convert(
                    pdf,
                    'api-key',
                    root,
                    cheap=True,
                    mime='application/pdf',
                )

            self.assertEqual(returned, result)
            post.assert_not_called()
            poll.assert_called_once_with('https://check/convert-1', 'api-key', label='convert')

    def test_extract_resumes_saved_submission_without_posting_again(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            schema = root / 'schema.json'
            schema.write_text(json.dumps({'title': 'test', 'type': 'object'}), encoding='utf-8')
            (root / '21_downtime_extract_submit.json').write_text(
                json.dumps({'request_id': 'extract-1', 'request_check_url': 'https://check/extract-1'}),
                encoding='utf-8',
            )
            result = {
                'status': 'complete',
                'success': True,
                'extraction_schema_json': {},
            }

            with (
                patch.object(dual_extract, 'http_json') as post,
                patch.object(dual_extract, 'poll_result', return_value=result) as poll,
            ):
                returned = dual_extract.run_extract(
                    'checkpoint-1',
                    schema,
                    'api-key',
                    root,
                    tag='downtime',
                    extraction_mode='fast',
                )

            self.assertEqual(returned, result)
            post.assert_not_called()
            poll.assert_called_once_with(
                'https://check/extract-1',
                'api-key',
                label='extract-downtime',
            )
