from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, call, patch

from django.test import TestCase

from ocr.models import OcrJobRecord
from ocr.pipeline import jobs
from production.models import Machine, ProductionRecord


class OcrJobDeletionTests(TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.jobs_dir = root / 'jobs'
        self.alias_dir = root / 'aliases'
        self.jobs_dir.mkdir()
        self.alias_dir.mkdir()
        self.jobs_patch = patch.object(jobs, 'JOBS_DIR', self.jobs_dir)
        self.alias_patch = patch.object(jobs, 'ALIAS_DIR', self.alias_dir)
        self.jobs_patch.start()
        self.alias_patch.start()

    def tearDown(self):
        self.alias_patch.stop()
        self.jobs_patch.stop()
        self.temp_dir.cleanup()

    def _store(self) -> Mock:
        store = Mock()
        store.list_alias_ids.return_value = []
        store.list_keys.return_value = []
        return store

    def _record(self, job_id: str, source_key: str = 'sources/shared.pdf') -> OcrJobRecord:
        job_dir = self.jobs_dir / job_id
        job_dir.mkdir()
        (job_dir / 'extract_merged_clean.json').write_text('{}', encoding='utf-8')
        return OcrJobRecord.objects.create(
            folder_name=job_id,
            display_name=job_id,
            ocr_status='done',
            metadata={
                'id': job_id,
                'status': 'done',
                'source_key': source_key,
                'has_merged_json': True,
            },
        )

    @patch('ocr.pipeline.jobs.get_store')
    def test_delete_removes_job_and_unshared_source_but_keeps_imported_data(self, get_store):
        store = self._store()
        get_store.return_value = store
        self._record('job-a')
        machine = Machine.objects.create(name='Machine 1', machine_id='M1', type='casting')
        imported = ProductionRecord.objects.create(
            machine=machine,
            date=date(2026, 10, 5),
            shift='morning',
            planned_production_time=480,
            operator_name='unknown',
            ocr_job_id='job-a',
        )

        jobs.delete_job('job-a')

        self.assertFalse(OcrJobRecord.objects.filter(folder_name='job-a').exists())
        self.assertFalse((self.jobs_dir / 'job-a').exists())
        self.assertTrue(ProductionRecord.objects.filter(pk=imported.pk).exists())
        store.delete_prefix.assert_called_once_with('jobs/job-a')
        self.assertIn(call('sources/shared.pdf'), store.delete_object.call_args_list)

    @patch('ocr.pipeline.jobs.get_store')
    def test_delete_keeps_source_referenced_by_another_job(self, get_store):
        store = self._store()
        get_store.return_value = store
        self._record('job-a')
        self._record('job-b')

        jobs.delete_job('job-a')

        self.assertFalse(OcrJobRecord.objects.filter(folder_name='job-a').exists())
        self.assertTrue(OcrJobRecord.objects.filter(folder_name='job-b').exists())
        self.assertNotIn(call('sources/shared.pdf'), store.delete_object.call_args_list)

    @patch('ocr.pipeline.jobs.get_store')
    def test_delete_keeps_source_referenced_by_staged_upload(self, get_store):
        store = self._store()
        store.list_keys.return_value = ['uploads/upl-hash/meta.json']
        store.get_json.return_value = {'source_key': 'sources/shared.pdf'}
        get_store.return_value = store
        self._record('job-a')

        jobs.delete_job('job-a')

        self.assertNotIn(call('sources/shared.pdf'), store.delete_object.call_args_list)
