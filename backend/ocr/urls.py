from django.urls import path

from ocr import views

urlpatterns = [
    path('options/', views.OcrOptionsView.as_view(), name='ocr-options'),
    path('jobs/', views.OcrJobListView.as_view(), name='ocr-jobs'),
    path('jobs/reconcile/', views.OcrJobReconcileView.as_view(), name='ocr-jobs-reconcile'),
    path('jobs/start/', views.OcrJobStartView.as_view(), name='ocr-jobs-start'),
    path('jobs/batch-import/', views.OcrBatchImportView.as_view(), name='ocr-batch-import'),
    path('jobs/<str:job_id>/', views.OcrJobDetailView.as_view(), name='ocr-job-detail'),
    path('jobs/<str:job_id>/original.png', views.OcrJobImageView.as_view(), {'kind': 'original'}, name='ocr-job-original'),
    path('jobs/<str:job_id>/merged.json', views.OcrMergedJsonView.as_view(), name='ocr-job-merged'),
    path('jobs/<str:job_id>/revert/', views.OcrJobRevertView.as_view(), name='ocr-job-revert'),
    path('jobs/<str:job_id>/import/', views.OcrJobImportView.as_view(), name='ocr-job-import'),
    path('jobs/<str:job_id>/import-status/', views.OcrJobImportStatusView.as_view(), name='ocr-job-import-status'),
    path('uploads/', views.OcrUploadView.as_view(), name='ocr-uploads'),
    path('uploads/<str:upload_id>/', views.OcrUploadView.as_view(), name='ocr-upload-delete'),
    path('uploads/<str:upload_id>/pages/<int:page>.png', views.OcrUploadPageView.as_view(), name='ocr-upload-page'),
]
