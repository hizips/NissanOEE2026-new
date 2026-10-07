from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('production', '0006_ocr_job_mapping'),
    ]

    operations = [
        migrations.AddField(
            model_name='operator',
            name='is_mock',
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name='machine',
            name='is_mock',
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name='partproductionhistory',
            name='is_mock',
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name='downtimeeventhistory',
            name='is_mock',
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name='productionrecord',
            name='is_mock',
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
