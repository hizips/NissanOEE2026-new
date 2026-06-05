from rest_framework import serializers
from .models import (
    Operator, Die, Part, Machine, DefectReason, DowntimeReasonItem, 
    ProcessReason, ScheduledDowntime, PartProductionHistory, 
    DowntimeEventHistory, ProductionRecord
)

class OperatorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Operator
        fields = '__all__'

class DieSerializer(serializers.ModelSerializer):
    class Meta:
        model = Die
        fields = '__all__'

class PartSerializer(serializers.ModelSerializer):
    dies = DieSerializer(many=True, read_only=True)
    # To allow writing, we can accept die IDs
    die_ids = serializers.PrimaryKeyRelatedField(
        many=True, write_only=True, queryset=Die.objects.all(), source='dies', required=False
    )

    class Meta:
        model = Part
        fields = '__all__'

class MachineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Machine
        fields = '__all__'

class DefectReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefectReason
        fields = '__all__'

class DowntimeReasonItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = DowntimeReasonItem
        fields = '__all__'

class ProcessReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcessReason
        fields = '__all__'

class ScheduledDowntimeSerializer(serializers.ModelSerializer):
    machine_name = serializers.ReadOnlyField(source='machine.name')

    class Meta:
        model = ScheduledDowntime
        fields = '__all__'

class PartProductionHistorySerializer(serializers.ModelSerializer):
    machine_name = serializers.ReadOnlyField(source='machine.name')
    part_name = serializers.ReadOnlyField(source='part.name')

    class Meta:
        model = PartProductionHistory
        fields = '__all__'

class DowntimeEventHistorySerializer(serializers.ModelSerializer):
    machine_name = serializers.ReadOnlyField(source='machine.name')

    class Meta:
        model = DowntimeEventHistory
        fields = '__all__'

class ProductionRecordSerializer(serializers.ModelSerializer):
    machine_name = serializers.ReadOnlyField(source='machine.name') 

    class Meta:
        model = ProductionRecord
        fields = '__all__'
