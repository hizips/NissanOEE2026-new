from django.db import migrations

CASTING_DEFECT_SUBCATEGORIES = [
    'Drag',
    'Crack',
    'Leaker',
    'Warmup',
    'Hand. Damage',
    'Trim Damage',
    'Robot Damage',
    'Misrun',
    'Gate Break',
    'Broken Biscuit',
    'Short Biscuit',
    'Blister',
    'Porosity',
    'Chipping',
    'Distortion',
    'Soldering',
    'Laser issues',
    'Stain',
    "Broken C' Pin",
    'Dropped in PIT',
    'Test / QA',
]


def replace_casting_defect_reasons(apps, schema_editor):
    DefectReason = apps.get_model('production', 'DefectReason')
    DefectReason.objects.filter(category='Casting Defect').delete()
    DefectReason.objects.bulk_create([
        DefectReason(
            category='Casting Defect',
            subcategory=name,
            specific_reason='',
            machine_types=['casting'],
            active=True,
        )
        for name in CASTING_DEFECT_SUBCATEGORIES
    ])


def reverse_casting_defect_reasons(apps, schema_editor):
    DefectReason = apps.get_model('production', 'DefectReason')
    DefectReason.objects.filter(category='Casting Defect').delete()
    legacy_casting = [
        ('Porosity', 'Surface Porosity'),
        ('Porosity', 'Internal Porosity'),
        ('Surface Defect', 'Cold Shut'),
        ('Surface Defect', 'Flash'),
        ('Dimensional', 'Warpage'),
    ]
    DefectReason.objects.bulk_create([
        DefectReason(
            category='Casting Defect',
            subcategory=subcategory,
            specific_reason=specific_reason,
            machine_types=['casting'],
            active=True,
        )
        for subcategory, specific_reason in legacy_casting
    ])


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0004_alter_defectreason_specific_reason_optional'),
    ]

    operations = [
        migrations.RunPython(replace_casting_defect_reasons, reverse_casting_defect_reasons),
    ]
