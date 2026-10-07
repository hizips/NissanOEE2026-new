# Nissan OEE AWS Deployment Summary

## Deployment status

The Nissan OEE application was deployed successfully to AWS on 6 October 2026.

| Item | Value |
| --- | --- |
| AWS Region | Sydney (`ap-southeast-2`) |
| CloudFormation application stack | `nissan-oee-application` |
| CloudFormation OCR storage stack | `nissan-oee-ocr-storage` |
| Public staging URL | <https://d28wim7z37okq2.cloudfront.net> |
| Elastic Beanstalk environment | `nissan-oee-prod` |
| Elastic Beanstalk origin | `nissan-oee-prod-102798328579.ap-southeast-2.elasticbeanstalk.com` |
| CloudFront distribution | `E2U9D2EUR7IBJ4` |
| Backend instance type | `t3.small` |
| Database | `nissan_oee` on the existing `b13b-sydney` RDS instance |
| OCR S3 prefix | `prod/ocr` |

At final verification:

- CloudFormation was `UPDATE_COMPLETE`.
- Elastic Beanstalk was `Ready`, `Green`, and `Ok`.
- The frontend returned HTTP 200.
- `/health/` returned HTTP 200 through CloudFront.
- An unauthenticated API request returned HTTP 401 as expected.
- A direct request to the Beanstalk origin timed out because public access is restricted to CloudFront.

## Architecture

```text
Browser
  |
  v
Amazon CloudFront - public HTTPS staging URL
  |                                        |
  | default route                          | /api/* and /health/
  v                                        v
Private S3 frontend bucket          Elastic Beanstalk CNAME
React/Vite static build                    |
                                           v
                                    One public t3.small EC2 instance
                                    Django + Gunicorn + OCR threads
                                      |                  |
                                      v                  v
                              Existing private RDS   Private OCR S3 bucket
                              MySQL / nissan_oee     Original PDFs and OCR data
                                                         |
                                                         v
                                                   Datalab OCR API
```

The initial environment intentionally uses one backend instance. Django and the
in-process OCR workers run together on this instance. The frontend is static and
is delivered separately from S3 through CloudFront.

## AWS services used

### AWS CloudFormation

CloudFormation is the infrastructure-as-code control plane for the deployment.
It was used so the infrastructure can be reviewed, reproduced, updated, and
rolled back consistently.

Templates:

- `infrastructure/application.yml` creates the frontend, CloudFront, Elastic
  Beanstalk, IAM, security groups, application secrets, and RDS ingress.
- `infrastructure/ocr-storage.yml` creates the persistent OCR S3 bucket.
- `infrastructure/ocr-audit.yml` is available but was not deployed for the lean
  initial environment.

### Amazon CloudFront

CloudFront is the public HTTPS entry point for both the frontend and API.

It is used to:

- Serve the React/Vite application from a private S3 origin.
- Route `/api/*` and `/health/` to Elastic Beanstalk.
- Redirect viewer HTTP requests to HTTPS.
- Disable caching for authenticated API routes.
- Forward API headers, cookies, and query strings.
- Add browser security headers.
- Rewrite extensionless frontend routes to `index.html` without rewriting API
  errors.

The current CloudFront URL is a staging URL. No custom domain or ACM certificate
has been configured yet.

### Amazon S3

Two S3 storage purposes are used.

#### Frontend bucket

Bucket: `nissan-oee-application-frontendbucket-ouidkscnzgfy`

This private bucket stores the compiled React/Vite files. Public access is
blocked. CloudFront reads the files through Origin Access Control. Versioning,
encryption, lifecycle cleanup, and an HTTPS-only bucket policy are enabled.

#### OCR artifacts bucket

Bucket: `nissan-oee-ocr-storage-ocrartifactsbucket-grhseneqa6pb`

This private bucket is the durable OCR system of record. It stores:

- Original uploaded PDF files.
- OCR job metadata and checkpoints.
- Datalab conversion and extraction artifacts.
- Extracted and user-edited JSON data.

Production objects are kept under `prod/ocr`. The frontend displays the original
PDF directly. The server does not create or store preview PNG files.

The bucket uses encryption, versioning, public-access blocking, non-TLS denial,
and lifecycle rules for abandoned uploads and old versions.

### AWS Elastic Beanstalk

Elastic Beanstalk manages the Python application environment and EC2 lifecycle.
The environment is named `nissan-oee-prod`.

It runs:

- Django and Django REST Framework.
- Gunicorn with one worker process and multiple threads.
- The in-process OCR queue and recovery logic.
- Poppler tools required for PDF page inspection and extraction.
- RDS schema migrations and static-file collection during deployment.

The environment is `SingleInstance` and uses `AllAtOnce` deployments. This
avoids paying for an Application Load Balancer and prevents two independent
in-process OCR queue owners from running during a deployment.

### Amazon EC2

Elastic Beanstalk currently runs one `t3.small` EC2 instance. It hosts both the
Django API and OCR processing.

The instance is in a public subnet and has direct outbound internet access for:

- Datalab OCR API requests.
- Package installation and deployment downloads.
- AWS service access.

This design avoids a NAT Gateway. Inbound HTTP is restricted to the AWS-managed
CloudFront origin-facing prefix list. The instance is not intended to be used as
a directly public website endpoint.

Instance IDs and Elastic IP addresses are considered replaceable and should not
be treated as permanent configuration values.

### Amazon RDS for MySQL

The deployment reuses the existing private RDS instance:

- Identifier: `b13b-sydney`
- Engine: MySQL 8.4
- Instance class: `db.t3.micro`
- New application database: `nissan_oee`
- New least-privilege application user: `nissan_oee_app`

The Nissan application does not reuse the other website's database or
application user. RDS accepts MySQL traffic from the dedicated Nissan backend
security group only.

The backend validates the RDS certificate chain and endpoint hostname with the
AWS RDS global CA bundle.

### AWS Secrets Manager

Secrets Manager stores:

- The generated Django signing key.
- The generated `nissan_oee_app` database password.
- The Datalab OCR API key copied from the authorized local configuration.

Elastic Beanstalk injects these as secret-backed environment variables. Secret
values are not stored in the CloudFormation template, repository, frontend
build, or this document.

Secrets use the AWS-managed Secrets Manager encryption key. A dedicated
customer-managed KMS key was deliberately omitted from the lean deployment.

The existing RDS administrator credential was used only during the first schema
bootstrap. Its environment variables and IAM access were removed after the
bootstrap completed.

### AWS Identity and Access Management

Dedicated IAM roles are used for:

- The Elastic Beanstalk EC2 instance.
- The Elastic Beanstalk service.

The instance role is scoped to:

- The OCR bucket and `prod/ocr` object prefix.
- The three application secrets.
- Elastic Beanstalk web-tier operations.
- Systems Manager instance management.

No long-lived AWS access keys are stored in application files.

### Amazon CloudWatch

Elastic Beanstalk streams application and proxy logs to CloudWatch Logs with a
30-day retention setting. Enhanced Beanstalk health reporting is enabled.

SNS alarm notifications and additional custom CloudWatch alarms were omitted
from the lean deployment. They can be added later when notification recipients
and operational thresholds are agreed.

### AWS Systems Manager

Systems Manager was used for controlled administration on the private
application runtime without opening SSH.

It was used to:

- Inspect non-secret deployment state.
- Import authentication data.
- Import the production dataset.
- Verify RDS record counts and application roles.

Temporary data-transfer files were deleted from the EC2 instance, local disk,
and S3 after verification.

## Services deliberately not deployed

The following services or components were removed from the initial design to
reduce fixed cost and complexity:

| Omitted service/component | Reason |
| --- | --- |
| Application Load Balancer | A single-instance Beanstalk environment can serve the CloudFront origin directly. |
| NAT Gateway | The single instance uses a public subnet for outbound access while inbound traffic remains CloudFront-only. |
| EFS | OCR persistence uses S3, and local instance storage is temporary processing scratch. |
| CloudTrail S3 data-event audit stack | Object-level auditing was not required for the initial deployment and would add cost. |
| SNS alarm topic | No notification recipients were configured. |
| Customer-managed KMS key | AWS-managed encryption provides the required initial protection without a separate key charge. |
| Separate OCR instance | OCR currently runs on the same `t3.small` instance as Django. |

## Network and security controls

- Viewer traffic uses HTTPS through CloudFront.
- The frontend S3 bucket and OCR S3 bucket block all public access.
- S3 bucket policies deny non-TLS requests.
- CloudFront is the only allowed source for inbound backend HTTP.
- The AWS-managed CloudFront origin prefix list is `pl-b8a742d1`.
- The Beanstalk-generated security group is overridden by
  `backend/.ebextensions/02_security.config` so it does not restore a public
  `0.0.0.0/0` rule.
- RDS is private and accepts port 3306 only from the Nissan backend security
  group.
- EC2 Instance Metadata Service v1 is disabled.
- Secret values are injected from Secrets Manager and are not exposed through
  CloudFormation outputs.
- Direct access to the Beanstalk origin was tested and timed out as intended.

## Database and authentication migration

### Authentication

The two local Django accounts were imported into RDS with their existing roles
and password hashes:

- `admin`: active staff and superuser.
- `operator`: active non-staff user.

The imported development passwords are temporary and must be changed promptly.
Passwords are intentionally not included in this document.

### Production data

The complete local `production` dataset was imported transactionally. RDS was
verified against the local SQLite counts:

| Model | Imported records |
| --- | ---: |
| Operator | 1 |
| Die | 3 |
| Part | 4 |
| Machine | 4 |
| DefectReason | 26 |
| DowntimeReasonItem | 18 |
| ProcessReason | 8 |
| ScheduledDowntime | 0 |
| PartProductionHistory | 296 |
| DowntimeEventHistory | 79 |
| ProductionRecord | 14 |

The RDS migrations initially created 21 casting defect reasons with different
primary keys. Before importing, those seed rows were replaced within the same
database transaction so local IDs 6 through 31 remained consistent and no
duplicate defect reasons were created.

OCR queue records and in-progress OCR jobs were not migrated. Existing
production records retain their OCR provenance IDs where present.

### Mock development data import - 7 October 2026

The local mock-only dataset was imported into the `nissan_oee` RDS schema after
the encrypted manual snapshot
`nissan-oee-pre-mock-import-20261007-015745` reached `available`. Migration
`production.0007_add_is_mock_flags` added an indexed `is_mock` column to the
operator, machine, production-record, part-history, and downtime-history tables.

The import added the following rows with `is_mock = true`:

| Model | Mock records |
| --- | ---: |
| Operator | 6 |
| Machine | 3 |
| ProductionRecord | 3,843 |
| PartProductionHistory | 21,461 |
| DowntimeEventHistory | 8,507 |

Post-import verification confirmed that the original non-mock counts remained
unchanged: 1 operator, 4 machines, 14 production records, 296 part-history rows,
and 79 downtime rows. The `is_mock` field is excluded from API serializers, so
it remains database-only. The temporary S3 transfer object and EC2 staging files
were deleted after verification.

## Backups and recovery points

Manual encrypted RDS snapshots were created before material changes:

- `nissan-oee-predeploy-20261006-011959`
- `nissan-oee-pre-auth-import-20261006-021738`
- `nissan-oee-pre-production-import-20261006-035658`
- `nissan-oee-pre-mock-import-20261007-015745`

The frontend and OCR buckets use `DeletionPolicy: Retain` and
`UpdateReplacePolicy: Retain` in CloudFormation. Deleting the application stack
will therefore not automatically delete retained bucket data.

## Build and deployment procedure

Build both application tiers from the repository root:

```bash
VITE_API_URL=/api ./scripts/build-aws.sh
```

This creates:

- `.aws-build/frontend/`
- `.aws-build/backend.zip`

The backend ZIP is uploaded to the existing Elastic Beanstalk regional bucket
under `nissan-oee/backend/`. A unique application version label must be used for
each deployment.

Deploy or update the CloudFormation application stack, then publish the
frontend:

```bash
aws s3 sync .aws-build/frontend/ \
  s3://nissan-oee-application-frontendbucket-ouidkscnzgfy/ \
  --region ap-southeast-2 --delete

aws cloudfront create-invalidation \
  --distribution-id E2U9D2EUR7IBJ4 \
  --paths /index.html
```

`index.html` should use `Cache-Control: no-cache, no-store, must-revalidate`.
Hashed Vite assets can retain normal CloudFront caching behaviour.

## Validation completed

The deployment was verified with:

- 15 passing backend tests.
- Django system checks.
- Django migration consistency check.
- Frontend TypeScript and Vite production build.
- Elastic Beanstalk backend packaging build.
- AWS CloudFormation `ValidateTemplate`.
- Live frontend HTTP 200.
- Live backend health HTTP 200.
- Expected unauthenticated API HTTP 401.
- Direct-origin connectivity blocked.
- Exact RDS production table counts.
- Authentication role verification.
- S3 transfer-object cleanup verification.

The frontend build reports a non-blocking warning that its main JavaScript chunk
is larger than 500 kB. Code splitting can be added later to improve initial load
performance.

`cfn-lint` and `cfn-guard` were not installed, so their local validation and
compliance layers were not run. AWS CloudFormation service validation did pass.

## Deployment issues resolved

The following issues were found and fixed during deployment:

1. A single-instance Beanstalk `EndpointURL` returned a raw Elastic IP, which
   CloudFront rejects as a custom-origin name. The environment now uses a
   deterministic Beanstalk CNAME.
2. Single-instance Beanstalk created an additional security group with public
   port 80 access. A Beanstalk resource override now restricts that generated
   group to the CloudFront origin prefix list.
3. Beanstalk retained the one-time RDS administrator variables after the
   CloudFormation bootstrap condition was disabled. They were explicitly
   removed, and the instance role no longer has permission to read the
   administrator parameter.
4. RDS seed defect reasons used different IDs from local SQLite. The guarded
   transaction replaced only the seed rows before importing the verified local
   dataset.

## Current limitations and next steps

1. Change the imported `admin` and `operator` passwords immediately.
2. Perform a complete user acceptance test, including login, production pages,
   OCR upload, OCR rerun, record import, scan preview, and OCR job deletion.
3. Monitor EC2 CPU, memory, disk usage, request latency, and OCR duration. Move
   to a larger instance if OCR competes with web requests.
4. Monitor the shared `db.t3.micro` RDS instance, particularly free memory and
   CPU, because it serves more than one application.
5. Keep the backend at one instance and one Gunicorn worker until OCR queue
   ownership is moved to an external service such as SQS and a separate worker.
6. Add a custom domain and ACM certificate only after staging acceptance.
7. Add alarms and notifications when operational recipients are known.
8. Consider installing and running `cfn-lint` and `cfn-guard` before the next
   infrastructure release.

## Related documentation

- [AWS deployment procedure](AWS_DEPLOYMENT.md)
- [Project handover](HANDOVER.md)
- [OCR workflow and import behaviour](docs/OCR_IMPORT.md)
