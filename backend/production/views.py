from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import (
    Operator, Die, Part, Machine, DefectReason, DowntimeReasonItem, 
    ProcessReason, ScheduledDowntime, PartProductionHistory, 
    DowntimeEventHistory, ProductionRecord
)
from .serializers import (
    OperatorSerializer, DieSerializer, PartSerializer, MachineSerializer, 
    DefectReasonSerializer, DowntimeReasonItemSerializer, ProcessReasonSerializer, 
    ScheduledDowntimeSerializer, PartProductionHistorySerializer, 
    DowntimeEventHistorySerializer, ProductionRecordSerializer
)

class OperatorViewSet(viewsets.ModelViewSet):
    queryset = Operator.objects.all()
    serializer_class = OperatorSerializer
    # permission_classes = [IsAuthenticated]

class DieViewSet(viewsets.ModelViewSet):
    queryset = Die.objects.all()
    serializer_class = DieSerializer

class PartViewSet(viewsets.ModelViewSet):
    queryset = Part.objects.all()
    serializer_class = PartSerializer

class MachineViewSet(viewsets.ModelViewSet):
    queryset = Machine.objects.all()
    serializer_class = MachineSerializer

class DefectReasonViewSet(viewsets.ModelViewSet):
    queryset = DefectReason.objects.all()
    serializer_class = DefectReasonSerializer

class DowntimeReasonItemViewSet(viewsets.ModelViewSet):
    queryset = DowntimeReasonItem.objects.all()
    serializer_class = DowntimeReasonItemSerializer

class ProcessReasonViewSet(viewsets.ModelViewSet):
    queryset = ProcessReason.objects.all()
    serializer_class = ProcessReasonSerializer

class ScheduledDowntimeViewSet(viewsets.ModelViewSet):
    queryset = ScheduledDowntime.objects.all().order_by('-date', '-start_time')
    serializer_class = ScheduledDowntimeSerializer

class PartProductionHistoryViewSet(viewsets.ModelViewSet):
    queryset = PartProductionHistory.objects.all().order_by('-timestamp')
    serializer_class = PartProductionHistorySerializer

class DowntimeEventHistoryViewSet(viewsets.ModelViewSet):
    queryset = DowntimeEventHistory.objects.all().order_by('-timestamp')
    serializer_class = DowntimeEventHistorySerializer

class ProductionRecordViewSet(viewsets.ModelViewSet):
    queryset = ProductionRecord.objects.all().order_by('-timestamp')
    serializer_class = ProductionRecordSerializer
