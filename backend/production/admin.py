from django.contrib import admin
from .models import (
    Operator, Die, Part, Machine, DefectReason, DowntimeReasonItem, 
    ProcessReason, ScheduledDowntime, PartProductionHistory, 
    DowntimeEventHistory, ProductionRecord
)

admin.site.register(Operator)
admin.site.register(Die)
admin.site.register(Part)
admin.site.register(Machine)
admin.site.register(DefectReason)
admin.site.register(DowntimeReasonItem)
admin.site.register(ProcessReason)
admin.site.register(ScheduledDowntime)
admin.site.register(PartProductionHistory)
admin.site.register(DowntimeEventHistory)
admin.site.register(ProductionRecord)
