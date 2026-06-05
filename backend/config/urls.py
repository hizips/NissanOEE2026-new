from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from production.views import (
    OperatorViewSet, DieViewSet, PartViewSet, MachineViewSet, 
    DefectReasonViewSet, DowntimeReasonItemViewSet, ProcessReasonViewSet, 
    ScheduledDowntimeViewSet, PartProductionHistoryViewSet, 
    DowntimeEventHistoryViewSet, ProductionRecordViewSet
)

router = DefaultRouter()
router.register(r'operators', OperatorViewSet)
router.register(r'dies', DieViewSet)
router.register(r'parts', PartViewSet)
router.register(r'machines', MachineViewSet)
router.register(r'defect-reasons', DefectReasonViewSet)
router.register(r'downtime-reasons', DowntimeReasonItemViewSet)
router.register(r'process-reasons', ProcessReasonViewSet)
router.register(r'scheduled-downtimes', ScheduledDowntimeViewSet)
router.register(r'part-production-history', PartProductionHistoryViewSet)
router.register(r'downtime-event-history', DowntimeEventHistoryViewSet)
router.register(r'records', ProductionRecordViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    # JWT Authentication Endpoints
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # Application Endpoints
    path('api/', include(router.urls)),
]
