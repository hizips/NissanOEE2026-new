from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from production.models import (
    Operator, Die, Part, Machine, DefectReason, 
    DowntimeReasonItem, ProcessReason
)

class Command(BaseCommand):
    help = 'Seeds the database with default OEE configuration data'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding database...')

        # 1. Create auth users
        # Operator generic login
        if not User.objects.filter(username='operator').exists():
            User.objects.create_user(username='operator', password='operator_password')
            self.stdout.write('Created generic operator user (username: operator, password: operator_password)')
            
        # Manager generic login
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser(username='admin', email='admin@example.com', password='admin')
            self.stdout.write('Created manager user (username: admin, password: admin)')

        # 2. Operators
        operators_data = [
            {'name': 'John Smith', 'employee_id': 'EMP001', 'role': 'Senior Operator'},
            {'name': 'Maria Garcia', 'employee_id': 'EMP002', 'role': 'Operator'},
            {'name': 'David Chen', 'employee_id': 'EMP003', 'role': 'Operator'},
            {'name': 'Sarah Johnson', 'employee_id': 'EMP004', 'role': 'Senior Operator'},
            {'name': 'Michael Brown', 'employee_id': 'EMP005', 'role': 'Operator'},
            {'name': 'Emily Davis', 'employee_id': 'EMP006', 'role': 'Operator'},
            {'name': 'Robert Wilson', 'employee_id': 'EMP007', 'role': 'Lead Operator'},
            {'name': 'Jennifer Lee', 'employee_id': 'EMP008', 'role': 'Operator'},
        ]
        for op in operators_data:
            Operator.objects.get_or_create(employee_id=op['employee_id'], defaults=op)
        
        # 3. Dies
        dies_data = [
            {'name': 'Die #1', 'die_number': 'D001'},
            {'name': 'Die #2', 'die_number': 'D002'},
            {'name': 'Die #3', 'die_number': 'D003'},
            {'name': 'Die #4', 'die_number': 'D004'},
            {'name': 'Die #5', 'die_number': 'D005'},
            {'name': 'Die #6', 'die_number': 'D006'},
            {'name': 'Die #8', 'die_number': 'D008'},
        ]
        die_objs = {}
        for d in dies_data:
            obj, _ = Die.objects.get_or_create(die_number=d['die_number'], defaults=d)
            die_objs[d['die_number']] = obj

        # 4. Parts
        parts_data = [
            {'name': 'Cylinder Head', 'part_number': 'CH-001', 'cycle_time': 2.5, 'dies': ['D001', 'D002', 'D003']},
            {'name': 'Engine Block', 'part_number': 'EB-001', 'cycle_time': 3.0, 'dies': ['D005', 'D008']},
            {'name': 'Transmission Case', 'part_number': 'TC-001', 'cycle_time': 2.8, 'dies': ['D004', 'D006']},
            {'name': 'Brake Caliper', 'part_number': 'BC-001', 'cycle_time': 1.8, 'dies': []},
            {'name': 'Wheel Hub', 'part_number': 'WH-001', 'cycle_time': 2.0, 'dies': []},
            {'name': 'Oil Pan', 'part_number': 'OP-001', 'cycle_time': 2.2, 'dies': []},
            {'name': 'Valve Cover', 'part_number': 'VC-001', 'cycle_time': 1.5, 'dies': []},
            {'name': 'Manifold', 'part_number': 'MF-001', 'cycle_time': 1.7, 'dies': []},
        ]
        part_objs = {}
        for p in parts_data:
            defaults = {'name': p['name'], 'cycle_time': p['cycle_time']}
            obj, _ = Part.objects.get_or_create(part_number=p['part_number'], defaults=defaults)
            for d in p['dies']:
                obj.dies.add(die_objs[d])
            part_objs[p['part_number']] = obj

        # 5. Machines
        machines_data = [
            {'name': 'Casting Machine A1', 'machine_id': 'M-CAST-001', 'type': 'casting', 'ideal_cycle_time': 2.5, 'status': 'running', 'parts': ['CH-001', 'EB-001', 'TC-001']},
            {'name': 'Casting Machine A2', 'machine_id': 'M-CAST-002', 'type': 'casting', 'ideal_cycle_time': 2.5, 'status': 'maintenance', 'parts': ['CH-001', 'EB-001']},
            {'name': 'Die Cast Machine B1', 'machine_id': 'M-CAST-003', 'type': 'casting', 'ideal_cycle_time': 3.0, 'status': 'running', 'parts': ['EB-001', 'TC-001']},
            {'name': 'CNC Machine B1', 'machine_id': 'M-MACH-001', 'type': 'machining', 'ideal_cycle_time': 1.8, 'status': 'running', 'parts': ['BC-001', 'WH-001']},
            {'name': 'CNC Machine B2', 'machine_id': 'M-MACH-002', 'type': 'machining', 'ideal_cycle_time': 2.0, 'status': 'running', 'parts': ['WH-001', 'OP-001']},
            {'name': 'Milling Machine C1', 'machine_id': 'M-MACH-003', 'type': 'machining', 'ideal_cycle_time': 2.2, 'status': 'idle', 'parts': ['OP-001', 'VC-001']},
            {'name': 'Drilling Machine D1', 'machine_id': 'M-MACH-004', 'type': 'machining', 'ideal_cycle_time': 1.5, 'status': 'running', 'parts': ['VC-001', 'MF-001']},
            {'name': 'Finishing Machine E2', 'machine_id': 'M-MACH-005', 'type': 'machining', 'ideal_cycle_time': 1.7, 'status': 'running', 'parts': ['BC-001', 'MF-001']},
        ]
        for m in machines_data:
            defaults = {'name': m['name'], 'type': m['type'], 'ideal_cycle_time': m['ideal_cycle_time'], 'status': m['status']}
            obj, _ = Machine.objects.get_or_create(machine_id=m['machine_id'], defaults=defaults)
            for p in m['parts']:
                obj.supported_parts.add(part_objs[p])

        # 6. Defect Reasons
        defect_data = [
            {'category': 'Casting Defect', 'subcategory': 'Porosity', 'specific_reason': 'Surface Porosity', 'machine_types': ['casting']},
            {'category': 'Casting Defect', 'subcategory': 'Porosity', 'specific_reason': 'Internal Porosity', 'machine_types': ['casting']},
            {'category': 'Casting Defect', 'subcategory': 'Surface Defect', 'specific_reason': 'Cold Shut', 'machine_types': ['casting']},
            {'category': 'Casting Defect', 'subcategory': 'Surface Defect', 'specific_reason': 'Flash', 'machine_types': ['casting']},
            {'category': 'Casting Defect', 'subcategory': 'Dimensional', 'specific_reason': 'Warpage', 'machine_types': ['casting']},
            {'category': 'Machining Defect', 'subcategory': 'Tool Related', 'specific_reason': 'Tool Breakage Mark', 'machine_types': ['machining']},
            {'category': 'Machining Defect', 'subcategory': 'Tool Related', 'specific_reason': 'Worn Cutting Tool', 'machine_types': ['machining']},
            {'category': 'Machining Defect', 'subcategory': 'Surface Finish', 'specific_reason': 'Rough Surface', 'machine_types': ['machining']},
            {'category': 'Machining Defect', 'subcategory': 'Dimensional', 'specific_reason': 'Out of Tolerance', 'machine_types': ['machining']},
            {'category': 'Material Defect', 'subcategory': 'Raw Material', 'specific_reason': 'Material Contamination', 'machine_types': []},
        ]
        for d in defect_data:
            DefectReason.objects.get_or_create(
                category=d['category'], subcategory=d['subcategory'], specific_reason=d['specific_reason'],
                defaults={'machine_types': d['machine_types']}
            )

        # 7. Downtime Reasons (simplified hierarchical setup)
        dt_data = [
            {'level': 1, 'name': 'Machine', 'id_str': 'dt1'},
            {'level': 2, 'parent': 'dt1', 'name': 'Die', 'id_str': 'dt1-1'},
            {'level': 3, 'parent': 'dt1-1', 'name': 'Ejector', 'id_str': 'dt1-1-1'},
            {'level': 4, 'parent': 'dt1-1-1', 'name': 'Ejector Pin Broken', 'id_str': 'dt1-1-1-1'},
            {'level': 3, 'parent': 'dt1-1', 'name': 'Core', 'id_str': 'dt1-1-2'},
            {'level': 4, 'parent': 'dt1-1-2', 'name': 'Core Stuck', 'id_str': 'dt1-1-2-1'},
            {'level': 2, 'parent': 'dt1', 'name': 'Hydraulic System', 'id_str': 'dt1-2'},
            {'level': 3, 'parent': 'dt1-2', 'name': 'Pump', 'id_str': 'dt1-2-1'},
            {'level': 3, 'parent': 'dt1-2', 'name': 'Valve', 'id_str': 'dt1-2-2'},
            {'level': 1, 'name': 'Material', 'id_str': 'dt2'},
            {'level': 2, 'parent': 'dt2', 'name': 'Shortage', 'id_str': 'dt2-1'},
            {'level': 2, 'parent': 'dt2', 'name': 'Quality Issue', 'id_str': 'dt2-2'},
            {'level': 1, 'name': 'Setup', 'id_str': 'dt3'},
            {'level': 2, 'parent': 'dt3', 'name': 'Die Change', 'id_str': 'dt3-1', 'extra': 'New Die Number'},
            {'level': 2, 'parent': 'dt3', 'name': 'Part Change', 'id_str': 'dt3-2'},
            {'level': 1, 'name': 'Quality', 'id_str': 'dt4'},
            {'level': 2, 'parent': 'dt4', 'name': 'Inspection', 'id_str': 'dt4-1'},
            {'level': 2, 'parent': 'dt4', 'name': 'Adjustment', 'id_str': 'dt4-2'},
        ]
        dt_objs = {}
        for d in dt_data:
            parent = dt_objs.get(d.get('parent')) if d.get('parent') else None
            obj, _ = DowntimeReasonItem.objects.get_or_create(
                level=d['level'], name=d['name'], parent=parent,
                defaults={'requires_extra_field': bool(d.get('extra')), 'extra_field_label': d.get('extra')}
            )
            dt_objs[d['id_str']] = obj

        # 8. Process Reasons
        pr_data = [
            {'name': 'Material Issue', 'description': 'Raw material quality or availability problem'},
            {'name': 'Operator Issue', 'description': 'Operator-related delay or mistake'},
            {'name': 'Quality Check Issue', 'description': 'Additional quality verification needed'},
            {'name': 'Setup Issue', 'description': 'Machine or tool setup problem'},
            {'name': 'Process Adjustment', 'description': 'Parameter adjustment or optimization'},
            {'name': 'Engineering Trial', 'description': 'Test run or experimental production'},
            {'name': 'Warm-up Shot', 'description': 'Initial test shots before production'},
            {'name': 'Die Change', 'description': 'Die replacement or maintenance'},
        ]
        for p in pr_data:
            ProcessReason.objects.get_or_create(name=p['name'], defaults={'description': p['description']})

        self.stdout.write(self.style.SUCCESS('Successfully seeded the database'))
