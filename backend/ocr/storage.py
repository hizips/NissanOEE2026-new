"""S3-backed durable storage for OCR uploads and job artifacts.

The OCR executables still need ordinary file paths while they run, so callers
may materialize an S3 prefix into the process-local scratch directory. S3 is
the source of truth; scratch files are disposable and are never relied on for
durability.
"""

from __future__ import annotations

import json
import mimetypes
from functools import lru_cache
from pathlib import Path, PurePosixPath

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def _safe_relative(value: str) -> str:
    path = PurePosixPath(str(value).replace("\\", "/").lstrip("/"))
    if not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError(f"Unsafe S3 object path: {value!r}")
    return path.as_posix()


class OcrS3Store:
    """Small, explicit S3 object-store adapter used by the OCR pipeline."""

    def __init__(self, *, bucket: str, prefix: str = "ocr", region: str | None = None):
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.client = boto3.client(
            "s3",
            region_name=region or None,
            config=Config(
                retries={"total_max_attempts": 4, "mode": "adaptive"},
                connect_timeout=5,
                read_timeout=60,
                max_pool_connections=20,
            ),
        )

    def key(self, relative: str) -> str:
        safe = _safe_relative(relative)
        return f"{self.prefix}/{safe}" if self.prefix else safe

    def exists(self, relative: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=self.key(relative))
            return True
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise

    def put_bytes(self, relative: str, data: bytes, *, content_type: str | None = None) -> None:
        args: dict[str, object] = {
            "Bucket": self.bucket,
            "Key": self.key(relative),
            "Body": data,
        }
        if content_type:
            args["ContentType"] = content_type
        self.client.put_object(**args)

    def put_bytes_if_absent(
        self,
        relative: str,
        data: bytes,
        *,
        content_type: str | None = None,
    ) -> bool:
        """Create an immutable object once; return False when it already exists."""
        args: dict[str, object] = {
            "Bucket": self.bucket,
            "Key": self.key(relative),
            "Body": data,
            "IfNoneMatch": "*",
        }
        if content_type:
            args["ContentType"] = content_type
        try:
            self.client.put_object(**args)
            return True
        except ClientError as exc:
            error = exc.response.get("Error", {})
            code = str(error.get("Code", ""))
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if code in {"PreconditionFailed", "ConditionalRequestConflict"} or status in {409, 412}:
                return False
            raise

    def put_text(self, relative: str, value: str, *, content_type: str = "text/plain") -> None:
        self.put_bytes(relative, value.encode("utf-8"), content_type=content_type)

    def put_json(self, relative: str, value: object) -> None:
        self.put_text(
            relative,
            json.dumps(value, indent=2, ensure_ascii=False),
            content_type="application/json",
        )

    def put_json_if_absent(self, relative: str, value: object) -> bool:
        return self.put_bytes_if_absent(
            relative,
            json.dumps(value, indent=2, ensure_ascii=False).encode("utf-8"),
            content_type="application/json",
        )

    def put_file(self, relative: str, source: Path) -> None:
        content_type = mimetypes.guess_type(source.name)[0] or "application/octet-stream"
        self.client.upload_file(
            str(source),
            self.bucket,
            self.key(relative),
            ExtraArgs={"ContentType": content_type},
        )

    def get_bytes(self, relative: str) -> bytes:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=self.key(relative))
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise FileNotFoundError(relative) from exc
            raise
        body = response["Body"]
        try:
            return body.read()
        finally:
            body.close()

    def get_text(self, relative: str) -> str:
        return self.get_bytes(relative).decode("utf-8")

    def get_json(self, relative: str) -> dict:
        value = json.loads(self.get_text(relative))
        if not isinstance(value, dict):
            raise ValueError(f"Expected a JSON object at {relative}")
        return value

    def download_file(self, relative: str, destination: Path) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.client.download_file(
                self.bucket,
                self.key(relative),
                str(destination),
            )
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise FileNotFoundError(relative) from exc
            raise
        return destination

    def list_keys(self, relative_prefix: str) -> list[str]:
        prefix = self.key(relative_prefix).rstrip("/") + "/"
        keys: list[str] = []
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                key = item["Key"]
                if self.prefix:
                    key = key[len(self.prefix) + 1 :]
                keys.append(key)
        return keys

    def list_job_ids(self) -> list[str]:
        ids = {
            parts[1]
            for key in self.list_keys("jobs")
            if (parts := PurePosixPath(key).parts)
            and len(parts) == 3
            and parts[0] == "jobs"
            and parts[1] != ".aliases"
            and parts[2] == "meta.json"
        }
        return sorted(ids)

    def list_alias_ids(self) -> list[str]:
        aliases = []
        for key in self.list_keys("jobs/.aliases"):
            parts = PurePosixPath(key).parts
            if len(parts) == 3 and parts[:2] == ("jobs", ".aliases"):
                aliases.append(parts[2])
        return sorted(aliases)

    def delete_prefix(self, relative_prefix: str) -> None:
        keys = self.list_keys(relative_prefix)
        for start in range(0, len(keys), 1000):
            batch = keys[start : start + 1000]
            self.client.delete_objects(
                Bucket=self.bucket,
                Delete={"Objects": [{"Key": self.key(key)} for key in batch], "Quiet": True},
            )

    def delete_object(self, relative: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=self.key(relative))

    def move_prefix(self, source: str, destination: str) -> None:
        source = _safe_relative(source).rstrip("/")
        destination = _safe_relative(destination).rstrip("/")
        keys = self.list_keys(source)
        for source_key in keys:
            suffix = source_key[len(source) :].lstrip("/")
            destination_key = f"{destination}/{suffix}"
            self.client.copy_object(
                Bucket=self.bucket,
                Key=self.key(destination_key),
                CopySource={"Bucket": self.bucket, "Key": self.key(source_key)},
            )
        self.delete_prefix(source)

    def upload_tree(self, source: Path, relative_prefix: str) -> None:
        for path in source.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(source).as_posix()
            self.put_file(f"{relative_prefix.rstrip('/')}/{relative}", path)

    def download_prefix(self, relative_prefix: str, destination: Path) -> Path:
        prefix = _safe_relative(relative_prefix).rstrip("/")
        keys = self.list_keys(prefix)
        if not keys:
            raise FileNotFoundError(relative_prefix)
        destination.mkdir(parents=True, exist_ok=True)
        for key in keys:
            suffix = key[len(prefix) :].lstrip("/")
            target = destination / suffix
            target.parent.mkdir(parents=True, exist_ok=True)
            self.client.download_file(self.bucket, self.key(key), str(target))
        return destination


@lru_cache(maxsize=1)
def get_store() -> OcrS3Store:
    if not settings.OCR_S3_BUCKET:
        raise ImproperlyConfigured("OCR_S3_BUCKET must be set when using the OCR API")
    return OcrS3Store(
        bucket=settings.OCR_S3_BUCKET,
        prefix=settings.OCR_S3_PREFIX,
        region=settings.AWS_REGION,
    )
