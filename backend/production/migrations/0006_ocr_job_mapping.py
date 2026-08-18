from django.db import migrations, models


def backfill_ocr_job_id(apps, schema_editor):
    ProductionRecord = apps.get_model('production', 'ProductionRecord')
    PartProductionHistory = apps.get_model('production', 'PartProductionHistory')
    DowntimeEventHistory = apps.get_model('production', 'DowntimeEventHistory')

    prefixes = ('OCR import from ', 'OCR downtime import from ')
    for rec in ProductionRecord.objects.exclude(notes__isnull=True).exclude(notes=''):
        notes = rec.notes.strip()
        job_id = None
        for prefix in prefixes:
            if notes.lower().startswith(prefix.lower()):
                job_id = notes[len(prefix):].strip()
                break
        if job_id:
            rec.ocr_job_id = job_id
            rec.save(update_fields=['ocr_job_id'])
            PartProductionHistory.objects.filter(
                machine_id=rec.machine_id,
                date=rec.date,
                shift=rec.shift,
                operator_name=rec.operator_name,
                comment__startswith='OCR import:',
            ).update(ocr_job_id=job_id)
            DowntimeEventHistory.objects.filter(
                machine_id=rec.machine_id,
                date=rec.date,
                shift=rec.shift,
                operator_name=rec.operator_name,
                comment__startswith='OCR import:',
            ).update(ocr_job_id=job_id)


class Migration(migrations.Migration):
    dependencies = [
        ('production', '0005_update_casting_defect_reasons'),
    ]

    operations = [
        migrations.AddField(
            model_name='productionrecord',
            name='ocr_job_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='partproductionhistory',
            name='ocr_job_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='downtimeeventhistory',
            name='ocr_job_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=200),
        ),
        migrations.RunPython(backfill_ocr_job_id, migrations.RunPython.noop),
    ]
