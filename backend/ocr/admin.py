from django.contrib import admin

from ocr.models import OcrJobRecord


@admin.register(OcrJobRecord)
class OcrJobRecordAdmin(admin.ModelAdmin):
    list_display = (
        'folder_name',
        'display_name',
        'ocr_status',
        'import_status',
        'last_imported_at',
    )
    search_fields = ('folder_name', 'display_name')
    list_filter = ('ocr_status', 'import_status')
