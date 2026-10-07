from __future__ import annotations

from io import BytesIO
from unittest import TestCase

import boto3
from botocore.response import StreamingBody
from botocore.stub import Stubber

from ocr.storage import OcrS3Store, _safe_relative


def make_store() -> tuple[OcrS3Store, Stubber]:
    client = boto3.client(
        "s3",
        region_name="ap-southeast-2",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )
    store = OcrS3Store.__new__(OcrS3Store)
    store.bucket = "test-bucket"
    store.prefix = "ocr"
    store.client = client
    return store, Stubber(client)


class OcrS3StoreTests(TestCase):
    def test_rejects_parent_path_segments(self):
        with self.assertRaises(ValueError):
            _safe_relative("jobs/../other")

    def test_get_bytes_reads_and_closes_stream(self):
        store, stubber = make_store()
        raw = BytesIO(b"scan")
        body = StreamingBody(raw, 4)
        stubber.add_response(
            "get_object",
            {"Body": body},
            {"Bucket": "test-bucket", "Key": "ocr/jobs/job-1/original.png"},
        )
        with stubber:
            self.assertEqual(store.get_bytes("jobs/job-1/original.png"), b"scan")
        self.assertTrue(raw.closed)

    def test_put_bytes_if_absent_does_not_overwrite_existing_object(self):
        store, stubber = make_store()
        stubber.add_client_error(
            "put_object",
            service_error_code="PreconditionFailed",
            service_message="At least one precondition failed",
            http_status_code=412,
            expected_params={
                "Bucket": "test-bucket",
                "Key": "ocr/sources/hash.pdf",
                "Body": b"pdf",
                "IfNoneMatch": "*",
                "ContentType": "application/pdf",
            },
        )
        with stubber:
            created = store.put_bytes_if_absent(
                "sources/hash.pdf",
                b"pdf",
                content_type="application/pdf",
            )
        self.assertFalse(created)

    def test_lists_only_job_meta_prefixes(self):
        store, stubber = make_store()
        stubber.add_response(
            "list_objects_v2",
            {
                "IsTruncated": False,
                "Name": "test-bucket",
                "Prefix": "ocr/jobs/",
                "MaxKeys": 1000,
                "KeyCount": 4,
                "Contents": [
                    {"Key": "ocr/jobs/job-a/meta.json", "ETag": '"1"', "Size": 1, "StorageClass": "STANDARD"},
                    {"Key": "ocr/jobs/job-a/input.pdf", "ETag": '"2"', "Size": 1, "StorageClass": "STANDARD"},
                    {"Key": "ocr/jobs/job-b/meta.json", "ETag": '"3"', "Size": 1, "StorageClass": "STANDARD"},
                    {"Key": "ocr/jobs/.aliases/old", "ETag": '"4"', "Size": 1, "StorageClass": "STANDARD"},
                ],
            },
            {"Bucket": "test-bucket", "Prefix": "ocr/jobs/"},
        )
        with stubber:
            self.assertEqual(store.list_job_ids(), ["job-a", "job-b"])
