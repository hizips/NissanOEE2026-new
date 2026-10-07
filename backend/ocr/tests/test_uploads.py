from hashlib import sha256
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from ocr.pipeline.uploads import create_upload


class ContentAddressedUploadTests(SimpleTestCase):
    @patch('ocr.pipeline.uploads.pdf_page_count', return_value=3)
    @patch('ocr.pipeline.uploads.get_store')
    def test_upload_uses_pdf_hash_and_skips_server_thumbnails(self, get_store, _page_count):
        pdf = b'%PDF-test-content'
        digest = sha256(pdf).hexdigest()
        store = Mock()
        store.put_bytes_if_absent.return_value = False
        store.put_json_if_absent.return_value = True
        get_store.return_value = store

        result = create_upload(pdf, 'sheet.pdf')

        self.assertEqual(result['id'], f'upl-{digest}')
        self.assertEqual(result['source_key'], f'sources/{digest}.pdf')
        self.assertEqual(result['page_count'], 3)
        self.assertTrue(result['deduplicated'])
        store.put_bytes_if_absent.assert_called_once_with(
            f'sources/{digest}.pdf',
            pdf,
            content_type='application/pdf',
        )
