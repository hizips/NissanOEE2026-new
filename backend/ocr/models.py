import hashlib
import json

from django.db import models
from django.utils import timezone


class OcrJobRecord(models.Model):
    IMPORT_NOT_IMPORTED = 'not_imported'
    IMPORT_IMPORTED = 'imported'
    IMPORT_STALE = 'stale'

    IMPORT_STATUS_CHOICES = [
        (IMPORT_NOT_IMPORTED, 'Not imported'),
        (IMPORT_IMPORTED, 'Imported'),
        (IMPORT_STALE, 'Stale'),
    ]

    folder_name = models.CharField(max_length=200, unique=True)
    display_name = models.CharField(max_length=300, blank=True, default='')
    ocr_status = models.CharField(max_length=20, default='queued')
    ocr_stage = models.CharField(max_length=40, blank=True, default='')
    import_status = models.CharField(
        max_length=20,
        choices=IMPORT_STATUS_CHOICES,
        default=IMPORT_NOT_IMPORTED,
    )
    imported_at = models.DateTimeField(null=True, blank=True)
    last_imported_at = models.DateTimeField(null=True, blank=True)
    last_import_rejects = models.BooleanField(default=False)
    last_import_downtime = models.BooleanField(default=False)
    merged_json_hash = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    @staticmethod
    def hash_merged(data: dict) -> str:
        payload = json.dumps(data, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode('utf-8')).hexdigest()

    def mark_stale_if_imported(self) -> None:
        if self.import_status == self.IMPORT_IMPORTED:
            self.import_status = self.IMPORT_STALE
            self.save(update_fields=['import_status', 'updated_at'])

    def mark_imported(self, *, import_rejects: bool, import_downtime: bool, merged_hash: str) -> None:
        now = timezone.now()
        if not self.imported_at:
            self.imported_at = now
        self.last_imported_at = now
        self.last_import_rejects = import_rejects
        self.last_import_downtime = import_downtime
        self.merged_json_hash = merged_hash
        self.import_status = self.IMPORT_IMPORTED
        self.save()

    def mark_not_imported(self) -> None:
        self.import_status = self.IMPORT_NOT_IMPORTED
        self.save(update_fields=['import_status', 'updated_at'])
