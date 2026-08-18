import json
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpResponse
from rest_framework import status
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from djangorestframework_camel_case.util import camelize
from rest_framework.views import APIView

from ocr.models import OcrJobRecord
from ocr.pipeline import jobs as job_pipeline
from ocr.pipeline.uploads import create_upload, delete_upload, read_upload_meta, thumb_path
from production.ocr_import_service import import_merged_data


class ManagerOnlyMixin:
    def permission_denied(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        if user.username == 'operator':
            return Response({'detail': 'Manager access required.'}, status=status.HTTP_403_FORBIDDEN)
        return None


def _job_payload(meta: dict) -> dict:
    folder = meta.get('id') or meta.get('folder_name')
    record = OcrJobRecord.objects.filter(folder_name=folder).first()
    payload = dict(meta)
    payload['importStatus'] = record.import_status if record else OcrJobRecord.IMPORT_NOT_IMPORTED
    payload['importedAt'] = record.last_imported_at.isoformat() if record and record.last_imported_at else None
    payload['lastImportRejects'] = record.last_import_rejects if record else False
    payload['lastImportDowntime'] = record.last_import_downtime if record else False
    return payload


class OcrOptionsView(ManagerOnlyMixin, APIView):
    def get(self, request):
        denied = self.permission_denied(request)
        if denied:
            return denied
        return Response({
            'convertModes': ['accurate', 'balanced', 'fast'],
            'extractionModes': ['fast', 'balanced', 'turbo'],
            'defaults': {
                'convertMode': job_pipeline.DEFAULT_CONVERT_MODE,
                'extractionMode': job_pipeline.DEFAULT_EXTRACTION_MODE,
            },
            'form': job_pipeline.form_template(),
            'queueDepth': job_pipeline.queue_depth(),
        })


class OcrJobListView(ManagerOnlyMixin, APIView):
    def get(self, request):
        denied = self.permission_denied(request)
        if denied:
            return denied
        jobs = [_job_payload(m) for m in job_pipeline.list_jobs()]
        return Response(jobs)


class OcrJobReconcileView(ManagerOnlyMixin, APIView):
    """Heal stuck OCR jobs: local artifacts first, then Datalab check URLs if still within retention."""

    def post(self, request):
        denied = self.permission_denied(request)
        if denied:
            return denied
        fetch = request.data.get('fetchDatalab', request.data.get('fetch_datalab', True))
        requeue = request.data.get('requeue', True)
        summary = job_pipeline.reconcile_jobs(
            fetch_datalab=bool(fetch),
            requeue=bool(requeue),
        )
        jobs = [_job_payload(m) for m in job_pipeline.list_jobs()]
        return Response({'summary': summary, 'jobs': jobs})


class OcrJobDetailView(ManagerOnlyMixin, APIView):
    def get(self, request, job_id):
        denied = self.permission_denied(request)
        if denied:
            return denied
        try:
            meta = job_pipeline.read_meta(job_pipeline.get_job_dir(job_id))
        except FileNotFoundError:
            return Response({'detail': 'Job not found.'}, status=status.HTTP_404_NOT_FOUND)
        meta['id'] = job_pipeline.get_job_dir(job_id).name
        return Response(_job_payload(meta))

    def delete(self, request, job_id):
        denied = self.permission_denied(request)
        if denied:
            return denied
        try:
            job_pipeline.delete_job(job_id)
        except FileNotFoundError:
            return Response({'detail': 'Job not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OcrJobStartView(ManagerOnlyMixin, APIView):
    def post(self, request):
        denied = self.permission_denied(request)
        if denied:
            return denied
        body = request.data
        upload_id = body.get('uploadId') or body.get('upload_id')
        pages = body.get('pages') or []
        convert_mode = body.get('convertMode') or body.get('convert_mode')
        extraction_mode = body.get('extractionMode') or body.get('extraction_mode')
        try:
            started = job_pipeline.start_jobs_from_upload(
                upload_id,
                pages,
                convert_mode=convert_mode or job_pipeline.DEFAULT_CONVERT_MODE,
                extraction_mode=extraction_mode or job_pipeline.DEFAULT_EXTRACTION_MODE,
            )
        except (FileNotFoundError, ValueError) as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'jobs': [_job_payload(j) for j in started]})


class OcrUploadView(ManagerOnlyMixin, APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        denied = self.permission_denied(request)
        if denied:
            return denied
        upload = request.FILES.get('file')
        if not upload:
            return Response({'detail': 'Missing file.'}, status=status.HTTP_400_BAD_REQUEST)
        if not upload.name.lower().endswith('.pdf'):
            return Response({'detail': 'Upload a PDF scan.'}, status=status.HTTP_400_BAD_REQUEST)
        data = upload.read()
        if not data:
            return Response({'detail': 'Empty upload.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            meta = create_upload(data, upload.name)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(meta)

    def delete(self, request, upload_id):
        denied = self.permission_denied(request)
        if denied:
            return denied
        try:
            delete_upload(upload_id)
        except FileNotFoundError:
            return Response({'detail': 'Upload not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OcrUploadPageView(ManagerOnlyMixin, APIView):
    def get(self, request, upload_id, page):
        denied = self.permission_denied(request)
        if denied:
            return denied
        try:
            path = thumb_path(upload_id, int(page))
        except FileNotFoundError:
            return Response({'detail': 'Page not found.'}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(path.open('rb'), content_type='image/png')


class OcrJobImageView(ManagerOnlyMixin, APIView):
    def get(self, request, job_id, kind):
        denied = self.permission_denied(request)
        if denied:
            return denied
        try:
            job_dir = job_pipeline.get_job_dir(job_id)
        except FileNotFoundError:
            return Response({'detail': 'Job not found.'}, status=status.HTTP_404_NOT_FOUND)
        filename = 'original.png'
        path = job_dir / filename
        if not path.is_file():
            return Response({'detail': 'Image not ready.'}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(path.open('rb'), content_type='image/png')


class OcrMergedJsonView(ManagerOnlyMixin, APIView):
    """Return merged extraction JSON in snake_case (not camelCased)."""
    renderer_classes = [JSONRenderer]
    parser_classes = [JSONParser]

    def get(self, request, job_id):
        denied = self.permission_denied(request)
        if denied:
            return denied
        try:
            merged = job_pipeline.load_merged(job_id)
        except FileNotFoundError:
            return Response({'detail': 'Merged JSON not ready.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'merged': merged})

    def put(self, request, job_id):
        denied = self.permission_denied(request)
        if denied:
            return denied
        try:
            result = job_pipeline.save_merged(job_id, request.data.get('merged') or request.data)
        except FileNotFoundError:
            return Response({'detail': 'Job not found.'}, status=status.HTTP_404_NOT_FOUND)
        meta = result['meta']
        meta['id'] = meta.get('id') or job_pipeline.get_job_dir(job_id).name
        return Response({
            'merged': result['merged'],
            'job': camelize(_job_payload(meta)),
        })


class OcrJobRevertView(ManagerOnlyMixin, APIView):
    def post(self, request, job_id):
        denied = self.permission_denied(request)
        if denied:
            return denied
        try:
            merged = job_pipeline.revert_merged(job_id)
        except FileNotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        return Response({'merged': merged})


class OcrJobImportView(ManagerOnlyMixin, APIView):
    def post(self, request, job_id):
        denied = self.permission_denied(request)
        if denied:
            return denied
        import_rejects = request.data.get('importRejects', request.data.get('import_rejects', True))
        import_downtime = request.data.get('importDowntime', request.data.get('import_downtime', True))
        operator_name = request.data.get('operatorName') or request.data.get('operator') or 'unknown'

        try:
            job_dir = job_pipeline.get_job_dir(job_id)
            merged = job_pipeline.load_merged(job_id)
        except FileNotFoundError:
            return Response({'detail': 'Job or merged JSON not found.'}, status=status.HTTP_404_NOT_FOUND)

        json_path = job_dir / 'extract_merged_clean.json'
        source_label = f'OCR import from {job_dir.name}'
        try:
            result = import_merged_data(
                merged,
                import_rejects=bool(import_rejects),
                import_downtime=bool(import_downtime),
                operator_name=operator_name,
                source_label=source_label,
                json_path=json_path,
                ocr_job_id=job_dir.name,
                ocr_job_ids=job_pipeline.all_ids_for_job(job_dir.name),
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        record, _ = OcrJobRecord.objects.get_or_create(folder_name=job_dir.name)
        record.mark_imported(
            import_rejects=bool(import_rejects),
            import_downtime=bool(import_downtime),
            merged_hash=OcrJobRecord.hash_merged(merged),
        )
        return Response({'result': result, 'importStatus': record.import_status})


class OcrJobImportStatusView(ManagerOnlyMixin, APIView):
    def patch(self, request, job_id):
        denied = self.permission_denied(request)
        if denied:
            return denied
        status_value = request.data.get('importStatus') or request.data.get('import_status')
        if status_value not in (OcrJobRecord.IMPORT_IMPORTED, OcrJobRecord.IMPORT_NOT_IMPORTED):
            return Response(
                {'detail': 'importStatus must be "imported" or "not_imported".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            job_dir = job_pipeline.get_job_dir(job_id)
        except FileNotFoundError:
            return Response({'detail': 'Job not found.'}, status=status.HTTP_404_NOT_FOUND)

        record, _ = OcrJobRecord.objects.get_or_create(folder_name=job_dir.name)
        if status_value == OcrJobRecord.IMPORT_IMPORTED:
            merged_hash = record.merged_json_hash
            try:
                merged_hash = OcrJobRecord.hash_merged(job_pipeline.load_merged(job_id))
            except FileNotFoundError:
                pass
            record.mark_imported(
                import_rejects=record.last_import_rejects,
                import_downtime=record.last_import_downtime,
                merged_hash=merged_hash,
            )
        else:
            record.mark_not_imported()

        meta = job_pipeline.read_meta(job_dir)
        meta['id'] = job_dir.name
        return Response(_job_payload(meta))


class OcrBatchImportView(ManagerOnlyMixin, APIView):
    def post(self, request):
        denied = self.permission_denied(request)
        if denied:
            return denied
        job_ids = request.data.get('jobIds') or request.data.get('job_ids') or []
        import_rejects = request.data.get('importRejects', request.data.get('import_rejects', True))
        import_downtime = request.data.get('importDowntime', request.data.get('import_downtime', True))
        operator_name = request.data.get('operatorName') or 'unknown'

        results = []
        for job_id in job_ids:
            try:
                job_dir = job_pipeline.get_job_dir(job_id)
                merged = job_pipeline.load_merged(job_id)
                meta = job_pipeline.read_meta(job_dir)
                if meta.get('status') != 'done':
                    results.append({'jobId': job_id, 'ok': False, 'error': 'Job not complete'})
                    continue
                import_merged_data(
                    merged,
                    import_rejects=bool(import_rejects),
                    import_downtime=bool(import_downtime),
                    operator_name=operator_name,
                    source_label=f'OCR import from {job_dir.name}',
                    json_path=job_dir / 'extract_merged_clean.json',
                    ocr_job_id=job_dir.name,
                    ocr_job_ids=job_pipeline.all_ids_for_job(job_dir.name),
                )
                record, _ = OcrJobRecord.objects.get_or_create(folder_name=job_dir.name)
                record.mark_imported(
                    import_rejects=bool(import_rejects),
                    import_downtime=bool(import_downtime),
                    merged_hash=OcrJobRecord.hash_merged(merged),
                )
                results.append({'jobId': job_id, 'ok': True})
            except Exception as e:
                results.append({'jobId': job_id, 'ok': False, 'error': str(e)})
        return Response({'results': results})
