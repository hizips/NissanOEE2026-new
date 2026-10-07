from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
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

def health_check(_request):
    """Load-balancer health check that does not require a database query."""
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('health/', health_check, name='health'),
    path('admin/', admin.site.urls),
    # JWT Authentication Endpoints
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # Application Endpoints
    path('api/', include(router.urls)),
]

if settings.ENABLE_OCR:
    urlpatterns.append(path('api/ocr/', include('ocr.urls')))
