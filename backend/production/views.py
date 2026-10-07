from django.db.models import Max, Min
from django.utils.dateparse import parse_date
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
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


class DateRangeQuerysetMixin:
    """Optionally constrain operational history endpoints by inclusive dates."""

    date_field = 'date'

    def get_queryset(self):
        queryset = super().get_queryset()
        start_value = self.request.query_params.get('start_date')
        end_value = self.request.query_params.get('end_date')

        start_date = self._parse_query_date('start_date', start_value)
        end_date = self._parse_query_date('end_date', end_value)
        if start_date and end_date and start_date > end_date:
            raise ValidationError({'date_range': 'start_date must be on or before end_date.'})
        if start_date:
            queryset = queryset.filter(**{f'{self.date_field}__gte': start_date})
        if end_date:
            queryset = queryset.filter(**{f'{self.date_field}__lte': end_date})
        return queryset

    @staticmethod
    def _parse_query_date(name, value):
        if not value:
            return None
        parsed = parse_date(value)
        if parsed is None:
            raise ValidationError({name: 'Use YYYY-MM-DD format.'})
        return parsed

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

class PartProductionHistoryViewSet(DateRangeQuerysetMixin, viewsets.ModelViewSet):
    queryset = PartProductionHistory.objects.all().order_by('-timestamp')
    serializer_class = PartProductionHistorySerializer

class DowntimeEventHistoryViewSet(DateRangeQuerysetMixin, viewsets.ModelViewSet):
    queryset = DowntimeEventHistory.objects.all().order_by('-timestamp')
    serializer_class = DowntimeEventHistorySerializer

class ProductionRecordViewSet(DateRangeQuerysetMixin, viewsets.ModelViewSet):
    queryset = ProductionRecord.objects.all().order_by('-timestamp')
    serializer_class = ProductionRecordSerializer

    @action(detail=False, methods=['get'], url_path='date-bounds')
    def date_bounds(self, request):
        bounds = ProductionRecord.objects.aggregate(
            minimum=Min('date'),
            maximum=Max('date'),
        )
        return Response({
            'min': bounds['minimum'].isoformat() if bounds['minimum'] else None,
            'max': bounds['maximum'].isoformat() if bounds['maximum'] else None,
        })

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        PartProductionHistory.objects.filter(
            machine=instance.machine,
            date=instance.date,
            shift=instance.shift,
            operator_name=instance.operator_name,
        ).delete()
        DowntimeEventHistory.objects.filter(
            machine=instance.machine,
            date=instance.date,
            shift=instance.shift,
            operator_name=instance.operator_name,
        ).delete()
        return super().destroy(request, *args, **kwargs)
