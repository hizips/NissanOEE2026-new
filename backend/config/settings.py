"""Django settings for the OEE application.

Local development defaults to SQLite and keeps the OCR workflow enabled. Both
local and AWS deployments persist OCR artifacts in the configured S3 bucket.
"""

import os
import tempfile
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent

# Local development reads backend/.env. Production receives values from the
# Elastic Beanstalk environment and Secrets Manager instead.
if os.getenv("APP_ENV", "development").strip().lower() != "production":
    load_dotenv(BASE_DIR / ".env")
    load_dotenv(BASE_DIR / ".env.s3")


def env_bool(name: str, default: bool = False) -> bool:
    """Read a conventional boolean environment variable."""
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: list[str] | None = None) -> list[str]:
    """Read a comma-separated environment variable."""
    value = os.getenv(name)
    if value is None:
        return list(default or [])
    return [item.strip() for item in value.split(",") if item.strip()]


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ImproperlyConfigured(f"{name} must be set for this deployment")
    return value


APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production"
DEBUG = env_bool("DJANGO_DEBUG", False)
ENABLE_OCR = env_bool("ENABLE_OCR", not IS_PRODUCTION)

AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-2").strip()
OCR_S3_BUCKET = os.getenv("OCR_S3_BUCKET", "").strip()
OCR_S3_PREFIX = os.getenv(
    "OCR_S3_PREFIX",
    "prod/ocr" if IS_PRODUCTION else "dev/ocr",
).strip().strip("/")
OCR_SCRATCH_ROOT = Path(
    os.getenv(
        "OCR_SCRATCH_ROOT",
        tempfile.mkdtemp(prefix="nissan-oee-ocr-"),
    ).strip()
)
if IS_PRODUCTION and ENABLE_OCR:
    required_env("DATALAB_API_KEY")
    required_env("OCR_S3_BUCKET")

if IS_PRODUCTION:
    SECRET_KEY = required_env("DJANGO_SECRET_KEY")
else:
    # Development-only fallback. Production startup fails unless a secret is
    # injected by Elastic Beanstalk from AWS Secrets Manager.
    SECRET_KEY = os.getenv(
        "DJANGO_SECRET_KEY",
        "django-insecure-local-development-only-change-me",
    )

LAN_HOSTS = [f"192.168.2.{i}" for i in range(256)]
LOCAL_ALLOWED_HOSTS = ["nissanoee.duckdns.org", "localhost", "127.0.0.1", *LAN_HOSTS]
ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    [] if IS_PRODUCTION else LOCAL_ALLOWED_HOSTS,
)
if IS_PRODUCTION and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must be set for production")


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "production",
]
if ENABLE_OCR:
    INSTALLED_APPS.append("ocr")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_RENDERER_CLASSES": (
        "djangorestframework_camel_case.render.CamelCaseJSONRenderer",
        "djangorestframework_camel_case.render.CamelCaseBrowsableAPIRenderer",
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ),
    "DEFAULT_PARSER_CLASSES": (
        "djangorestframework_camel_case.parser.CamelCaseJSONParser",
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ),
}

MIDDLEWARE = [
    "config.middleware.HealthCheckMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
WSGI_APPLICATION = "config.wsgi.application"


DB_ENGINE = os.getenv("DB_ENGINE", "sqlite").strip().lower()
if IS_PRODUCTION and DB_ENGINE != "mysql":
    raise ImproperlyConfigured("Production deployments must set DB_ENGINE=mysql")

if DB_ENGINE == "mysql":
    mysql_options: dict[str, object] = {
        "charset": "utf8mb4",
        "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
    }
    db_ssl_ca = (
        required_env("DB_SSL_CA")
        if IS_PRODUCTION
        else os.getenv("DB_SSL_CA", "").strip()
    )
    if db_ssl_ca:
        mysql_options["ssl"] = {
            "ca": db_ssl_ca,
            "check_hostname": True,
        }

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": required_env("DB_NAME"),
            "USER": required_env("DB_USER"),
            "PASSWORD": required_env("DB_PASSWORD"),
            "HOST": required_env("DB_HOST"),
            "PORT": os.getenv("DB_PORT", "3306"),
            "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
            "CONN_HEALTH_CHECKS": env_bool(
                "DB_CONN_HEALTH_CHECKS",
                IS_PRODUCTION,
            ),
            "OPTIONS": mysql_options,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
            "OPTIONS": {"timeout": 5},
        }
    }


AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Australia/Melbourne"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

LOCAL_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://nissanoee.duckdns.org",
    *[f"http://{host}:5173" for host in LAN_HOSTS],
]
LOCAL_CSRF_ORIGINS = [
    "https://nissanoee.duckdns.org",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    *[f"http://{host}:5173" for host in LAN_HOSTS],
    *[f"http://{host}:8000" for host in LAN_HOSTS],
]
CORS_ALLOWED_ORIGINS = env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    [] if IS_PRODUCTION else LOCAL_CORS_ORIGINS,
)
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    [] if IS_PRODUCTION else LOCAL_CSRF_ORIGINS,
)
CORS_ALLOWED_ORIGIN_REGEXES = (
    [] if IS_PRODUCTION else [r"^http://192\.168\.2\.\d{1,3}:5173$"]
)

# Elastic Load Balancing terminates TLS and forwards this header to Django.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", IS_PRODUCTION)
SESSION_COOKIE_SECURE = IS_PRODUCTION
CSRF_COOKIE_SECURE = IS_PRODUCTION
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_HSTS_SECONDS = int(
    os.getenv("DJANGO_SECURE_HSTS_SECONDS", "31536000" if IS_PRODUCTION else "0")
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool(
    "DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS",
    False,
)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", False)
