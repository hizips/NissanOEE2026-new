# AWS deployment

The AWS build includes the OCR application. Runtime uploads, scans, and OCR
artifacts are not bundled; they live in a private S3 bucket.

## Target architecture

- Frontend and API entry point: one CloudFront staging URL. The default origin
  is a private S3 frontend bucket; `/api/*` and `/health/` proxy to the backend.
- Backend: a new single-instance Elastic Beanstalk Python environment using one
  public `t3.small` instance in `ap-southeast-2`.
- Database: a separate database and least-privilege user on the existing
  private RDS MySQL instance `b13b-sydney`.
- OCR storage: a private, encrypted, versioned S3 bucket. Local files are
  disposable processing scratch only.
- Secrets: AWS Secrets Manager, injected as Elastic Beanstalk secret-backed
  environment variables.
- Network: place the new Beanstalk instance in a public subnet in the existing
  RDS VPC. Its public IP removes the NAT Gateway requirement. The instance
  security group accepts HTTP only from the AWS-managed CloudFront origin-facing
  prefix list. Allow MySQL port 3306 on the RDS security group only from the new
  Beanstalk instance security group.

Single-instance Beanstalk also generates and attaches its own EC2 security
group. `backend/.ebextensions/02_security.config` overrides that generated
group so port 80 also remains limited to the CloudFront origin-facing prefix
list; otherwise Beanstalk's default rule would expose the instance directly.
The environment uses a deterministic Beanstalk CNAME because CloudFront custom
origins require a DNS name and reject the raw Elastic IP returned by the
single-instance environment's `EndpointURL` attribute.

Do not add the new application to the existing Beanstalk environment. A
separate environment gives it independent deployments, health checks, scaling,
logs, and rollback while still allowing safe reuse of the RDS instance.

## Required backend configuration

The source bundle contains non-secret defaults in
`backend/.ebextensions/01_django.config`. Configure these environment values on
the new environment:

| Variable | Value |
| --- | --- |
| `DJANGO_ALLOWED_HOSTS` | `.elasticbeanstalk.com` for the CloudFront staging topology |
| `DB_HOST` | Private RDS endpoint |
| `DB_PORT` | `3306` |
| `DB_NAME` | New database name for this application |
| `DB_USER` | New least-privilege database user |
| `OCR_S3_BUCKET` | Output of the `nissan-oee-ocr-storage` CloudFormation stack |
| `OCR_S3_PREFIX` | `prod/ocr` |
| `AWS_REGION` | `ap-southeast-2` |

The source bundle installs the current AWS RDS global CA bundle during the
Elastic Beanstalk `prebuild` phase and sets
`DB_SSL_CA=/etc/pki/rds/global-bundle.pem`. Production startup fails if this
setting is missing. PyMySQL validates both the CA chain and the RDS endpoint
hostname. The Beanstalk instances therefore need outbound HTTPS access to
`truststore.pki.rds.amazonaws.com` during deployment.

Create separate Secrets Manager secrets for the Django secret key, database
password, and Datalab API key. Map their ARNs to `DJANGO_SECRET_KEY`,
`DB_PASSWORD`, and `DATALAB_API_KEY` with the
`aws:elasticbeanstalk:application:environmentsecrets` option namespace. Grant
the Beanstalk EC2 instance profile only `secretsmanager:GetSecretValue` for
those ARNs. Never put their values in `.env`, source control, build logs, or
Vite variables.

Keep these bundled settings unchanged in AWS:

```text
APP_ENV=production
DB_ENGINE=mysql
DJANGO_DEBUG=false
ENABLE_OCR=true
AWS_REGION=ap-southeast-2
OCR_S3_BUCKET=<CloudFormation BucketName output>
OCR_S3_PREFIX=prod/ocr
DB_CONN_HEALTH_CHECKS=true
DB_SSL_CA=/etc/pki/rds/global-bundle.pem
DJANGO_SECURE_SSL_REDIRECT=false
```

The initial staging topology terminates viewer HTTPS at CloudFront and applies
HSTS and browser security headers there. Django's own HTTPS redirect is disabled
because CloudFront reaches the restricted Beanstalk instance over HTTP. For a
custom production domain, add ACM/DNS and evaluate an HTTPS origin before
treating the staging distribution as the final production design.

## Infrastructure templates

Deploy the version-controlled templates in this order:

1. `infrastructure/ocr-storage.yml` creates the private OCR bucket and the
   `prod/ocr` lifecycle boundary.
2. Do not deploy `infrastructure/ocr-audit.yml` for the lean initial environment.
   It remains available if object-level audit history is required later.
3. Upload `.aws-build/backend.zip` to an application-version bucket, then deploy
   `infrastructure/application.yml`. It creates the frontend bucket, CloudFront,
   single-instance Beanstalk environment, dedicated IAM roles/security groups,
   scoped RDS ingress, generated application secrets, and log streaming.

The application template generates separate Django and database password secrets
and takes the Datalab secret ARN, never its value. Each secret's whole value is
injected into `DJANGO_SECRET_KEY`, `DB_PASSWORD`, or `DATALAB_API_KEY`. Secrets
use the AWS-managed Secrets Manager encryption key, avoiding a dedicated KMS key.

## Build

Install Node.js, npm, Python tooling, `rsync`, and `zip`, then run from the
repository root:

```bash
VITE_API_URL=/api ./scripts/build-aws.sh
```

This produces:

- `.aws-build/backend.zip`, ready for a new Elastic Beanstalk application
  version.
- `.aws-build/frontend/`, ready to sync to the private S3 origin bucket.

The frontend build forces `VITE_ENABLE_OCR=true`. The backend bundle includes
the OCR API, pipeline, import services, templates, and Pillow.

The frontend renders scan previews directly from the source PDF. The Elastic
Beanstalk prebuild hook installs Poppler for `pdfinfo` page counting and
`pdfseparate` OCR page extraction; the backend no longer renders preview PNGs.

The OCR queue runs as threads inside the Django process. The application and
bundle config enforce a single-instance environment, one Gunicorn process, and
`AllAtOnce` deployment. Do not increase instance or
process count or select rolling/immutable deployment until queue ownership is
moved to SQS or another external worker system.

Start with `t3.small` for the combined Django and OCR process. Monitor CPU,
memory, swap, request latency, and OCR duration before deciding whether to move
to a larger instance type.

Deploy `infrastructure/ocr-storage.yml` before the backend. Grant the Elastic
Beanstalk instance role only `s3:ListBucket` on the bucket and
`s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` on `prod/ocr/*`. The bucket is
the durable system of record; application deployments and instance replacement
do not erase uploaded scans or completed OCR results. Enable CloudTrail S3 data
events if object-level audit history is required. The template aborts incomplete
multipart uploads after 7 days, expires abandoned staging metadata after 1 day,
and retains only one noncurrent version for 7 days to bound versioning cost.

## Database preparation

Before the first application deployment:

1. Take an RDS snapshot.
2. Create a new database/schema and a dedicated user on `b13b-sydney`; do not
   reuse the other website's database or application user.
3. Deploy once with `BootstrapDatabase=true` and the existing RDS admin
   SecureString ARN. The deployment creates the schema and restricted user,
   then runs migrations without printing either password.
4. Update the stack with `BootstrapDatabase=false` immediately after the first
   successful deployment. This removes the admin parameter from the environment
   and removes permission to read it.
5. Keep the inbound rule on RDS security group `sg-0b7fe7ebc049cdc33` limited to
   TCP 3306 from the new Beanstalk instance security group.
6. Test a staging deployment and data import before switching production DNS.

The Beanstalk deployment runs `collectstatic` and `migrate` once per deployment.
The `/health/` endpoint does not query RDS, so load-balancer health remains a
clean application-process signal.

### Move the current SQLite data

Export application records only. Do not export users, content types,
permissions, sessions, or OCR queue state:

```bash
cd backend
.venv/bin/python manage.py dumpdata production \
  --natural-foreign --natural-primary --indent 2 \
  --output ../oee-data.json
```

Keep `oee-data.json` outside source control because it contains operational and
account data. After taking an RDS snapshot, deploying the schema with
`manage.py migrate`, and configuring a secure network path to the private RDS
instance, load the file from a one-off Beanstalk instance command or an SSM
session:

```bash
python manage.py loaddata oee-data.json
```

Create fresh manager and operator accounts directly in the new database after
loading application records. Give the manager only the Django privileges the
site requires. Create username `operator` as a normal active user with a new
password, because the current application uses that username for operator-only
access checks. Do not reuse local seeded passwords.

This intentionally creates clean authentication and `ocr_ocrjobrecord` tables
in AWS. Production records keep their `ocr_job_id` provenance. If historical
scan previews must also be kept,
use `manage.py import_legacy_ocr_jobs` to upload only completed job directories
and their matching `done` database records to S3; never migrate an in-progress
queue entry.

Test this process against the new database/schema before changing production
DNS. Repeating `loaddata` against a populated schema can create conflicts, so
restore the snapshot or empty only the new application schema before retrying.

## Frontend publishing

Sync `.aws-build/frontend/` to the `FrontendBucketName` output. The template
already configures CloudFront OAC, HTTPS redirection, API proxying, compression,
security headers, and an extensionless-route SPA rewrite that leaves API 404s
untouched. After a release, invalidate
`/index.html` on the `CloudFrontDistributionId` output.

Use ACM and the current DNS provider for a later custom domain. If the backend
origin is changed to HTTPS, configure its certificate and CloudFront origin
policy together. The frontend origin must match the Django CORS and CSRF values
exactly, including `https://` and without a trailing slash.

## Production checks

- `GET /health/` returns HTTP 200 without database access.
- `GET /api/machines/` without a JWT returns HTTP 401.
- Login returns a JWT and authenticated API calls succeed.
- `/api/ocr/options/` returns HTTP 200 for an authenticated manager.
- Content-addressed source PDFs, job metadata, OCR artifacts, and edited JSON
  persist in the private S3 bucket. Browser-rendered previews do not create PNG
  objects in S3.
- Shift Records can open the matching OCR scan preview after import.
- CloudWatch receives Beanstalk application and nginx logs.
- RDS remains private and accepts connections only from explicitly allowed
  application security groups.
