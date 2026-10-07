from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('ocr', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='ocrjobrecord',
            name='metadata',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
