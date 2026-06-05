from django.db import models

class Operator(models.Model):
    name = models.CharField(max_length=100)
    employee_id = models.CharField(max_length=50, unique=True)
    role = models.CharField(max_length=50)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

class Die(models.Model):
    name = models.CharField(max_length=100)
    die_number = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return f"{self.name} ({self.die_number})"

class Part(models.Model):
    name = models.CharField(max_length=100)
    part_number = models.CharField(max_length=50, unique=True)
    cycle_time = models.FloatField() # in minutes
    active = models.BooleanField(default=True)
    dies = models.ManyToManyField(Die, blank=True)
    image = models.URLField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.part_number})"

class Machine(models.Model):
    name = models.CharField(max_length=100)
    machine_id = models.CharField(max_length=50, unique=True)
    # Changed to CharField to allow arbitrary types like 'casting', 'machining', 'buffing', etc.
    type = models.CharField(max_length=50)
    ideal_cycle_time = models.FloatField(blank=True, null=True) # in minutes
    default_shift_time = models.IntegerField(default=480) # in minutes
    status = models.CharField(max_length=20, default='idle')
    active = models.BooleanField(default=True)
    supported_parts = models.ManyToManyField(Part, blank=True)
    image = models.URLField(blank=True, null=True)

    def __str__(self):
        return self.name

class DefectReason(models.Model):
    category = models.CharField(max_length=100)
    subcategory = models.CharField(max_length=100)
    specific_reason = models.CharField(max_length=200)
    machine_types = models.JSONField(blank=True, default=list)
    machine_ids = models.JSONField(blank=True, default=list)
    part_ids = models.JSONField(blank=True, default=list)
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.category} - {self.specific_reason}"

class DowntimeReasonItem(models.Model):
    level = models.IntegerField()
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    name = models.CharField(max_length=100)
    requires_extra_field = models.BooleanField(default=False)
    extra_field_label = models.CharField(max_length=100, blank=True, null=True)
    machine_types = models.JSONField(blank=True, default=list)
    machine_ids = models.JSONField(blank=True, default=list)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

class ProcessReason(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    machine_types = models.JSONField(blank=True, default=list)
    machine_ids = models.JSONField(blank=True, default=list)
    part_ids = models.JSONField(blank=True, default=list)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

class ScheduledDowntime(models.Model):
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    duration = models.IntegerField() # in minutes
    reason = models.CharField(max_length=200)
    comment = models.TextField(blank=True, null=True)

class PartProductionHistory(models.Model):
    SHIFT_CHOICES = [('morning', 'Morning'), ('afternoon', 'Afternoon'), ('night', 'Night')]
    RESULT_CHOICES = [('PASS', 'Pass'), ('NOT GOOD', 'Not Good')]

    machine = models.ForeignKey(Machine, on_delete=models.CASCADE)
    part = models.ForeignKey(Part, on_delete=models.SET_NULL, null=True, blank=True)
    die = models.CharField(max_length=100, blank=True, null=True)
    operator_name = models.CharField(max_length=100)
    date = models.DateField()
    shift = models.CharField(max_length=20, choices=SHIFT_CHOICES)
    result = models.CharField(max_length=20, choices=RESULT_CHOICES)
    defect_category = models.CharField(max_length=100, blank=True, null=True)
    defect_subcategory = models.CharField(max_length=100, blank=True, null=True)
    defect_specific_reason = models.CharField(max_length=200, blank=True, null=True)
    comment = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

class DowntimeEventHistory(models.Model):
    SHIFT_CHOICES = [('morning', 'Morning'), ('afternoon', 'Afternoon'), ('night', 'Night')]

    machine = models.ForeignKey(Machine, on_delete=models.CASCADE)
    operator_name = models.CharField(max_length=100)
    date = models.DateField()
    shift = models.CharField(max_length=20, choices=SHIFT_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()
    duration = models.IntegerField() # in minutes
    reason_category = models.CharField(max_length=100)
    reason_subsystem = models.CharField(max_length=100, blank=True, null=True)
    reason_component = models.CharField(max_length=100, blank=True, null=True)
    reason_specific_item = models.CharField(max_length=100, blank=True, null=True)
    reason_full_path = models.CharField(max_length=300)
    comment = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

class ProductionRecord(models.Model):
    SHIFT_CHOICES = [('morning', 'Morning'), ('afternoon', 'Afternoon'), ('night', 'Night')]
    
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='records')
    date = models.DateField()
    shift = models.CharField(max_length=20, choices=SHIFT_CHOICES)
    planned_production_time = models.IntegerField()
    counter_start = models.IntegerField(default=0)
    counter_end = models.IntegerField(default=0)
    gross_count = models.IntegerField(default=0)
    excluded_shots = models.IntegerField(default=0)
    net_production = models.IntegerField(default=0)
    total_count = models.IntegerField(default=0)
    target_output = models.IntegerField(default=0)
    performance = models.FloatField(default=0.0)
    downtime = models.IntegerField(default=0)
    good_count = models.IntegerField(default=0)
    defect_count = models.IntegerField(default=0)
    operator_name = models.CharField(max_length=100)
    notes = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    downtime_events = models.JSONField(blank=True, default=list)
    defects = models.JSONField(blank=True, default=list)
