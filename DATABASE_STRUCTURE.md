# Nissan OEE Database Structure

This document describes the live `nissan_oee` database currently deployed on Amazon RDS in `ap-southeast-2`. The inventory was captured read-only on 2026-10-06 at 05:34:15 UTC.

## Snapshot overview

| Property | Value |
|---|---|
| Database | `nissan_oee` |
| Engine | MySQL 8.4.11 on Amazon RDS |
| Storage engine | InnoDB for all 24 tables |
| Default table collation | `utf8mb4_unicode_ci` |
| Tables | 24 |
| Columns | 171 |
| Constraints | 58 |
| Foreign keys | 19 |
| Logical indexes | 55 |
| Index column entries | 62 |
| Physical rows | 580 |

The database is a Django schema split into four functional areas:

1. Authentication and Django framework state
2. Production reference/master data
3. Production activity and history
4. OCR job metadata

OCR source PDFs and generated extraction artifacts are stored in S3. They are not stored as binary data in MySQL.

## Current table sizes

| Area | Table | Rows | Purpose |
|---|---|---:|---|
| Authentication | `auth_user` | 2 | Application login accounts and password hashes |
| Authentication | `auth_group` | 0 | Permission groups |
| Authentication | `auth_permission` | 72 | Django model permissions |
| Authentication | `auth_group_permissions` | 0 | Group-to-permission links |
| Authentication | `auth_user_groups` | 0 | User-to-group links |
| Authentication | `auth_user_user_permissions` | 0 | Direct user-to-permission links |
| Django | `django_content_type` | 18 | Registered Django models |
| Django | `django_migrations` | 26 | Applied schema migrations |
| Django | `django_session` | 0 | Server-side session data |
| Django | `django_admin_log` | 0 | Django admin audit entries |
| OCR | `ocr_ocrjobrecord` | 1 | OCR workflow and import metadata |
| Production reference | `production_machine` | 4 | Machines |
| Production reference | `production_part` | 4 | Parts |
| Production reference | `production_die` | 3 | Dies |
| Production reference | `production_operator` | 1 | Operators |
| Production reference | `production_defectreason` | 26 | Defect classification rules |
| Production reference | `production_downtimereasonitem` | 18 | Hierarchical downtime reason tree |
| Production reference | `production_processreason` | 8 | Process reason rules |
| Production relationship | `production_machine_supported_parts` | 4 | Machines-to-parts many-to-many links |
| Production relationship | `production_part_dies` | 4 | Parts-to-dies many-to-many links |
| Production history | `production_productionrecord` | 14 | Per-machine production/OEE records |
| Production history | `production_partproductionhistory` | 296 | Part production outcome history |
| Production history | `production_downtimeeventhistory` | 79 | Downtime event history |
| Production history | `production_scheduleddowntime` | 0 | Planned downtime intervals |

## Relationship map

```text
production_machine
  |--< production_productionrecord
  |--< production_partproductionhistory >-- production_part
  |--< production_downtimeeventhistory
  |--< production_scheduleddowntime
  `--< production_machine_supported_parts >-- production_part

production_part
  `--< production_part_dies >-- production_die

production_downtimereasonitem
  `--< production_downtimereasonitem  (parent/child reason tree)

django_content_type
  |--< auth_permission
  `--< django_admin_log

auth_user
  |--< auth_user_groups >-- auth_group
  |--< auth_user_user_permissions >-- auth_permission
  `--< django_admin_log

auth_group
  `--< auth_group_permissions >-- auth_permission
```

Every physical foreign key currently uses `NO ACTION` for both update and delete. Application-level Django delete behavior can still differ because Django may explicitly delete, protect, null, or cascade related rows before issuing SQL.

The production history tables contain an `ocr_job_id` string for provenance, but it is not a SQL foreign key to `ocr_ocrjobrecord`. This deliberately keeps imported operational records independent from deletion of the temporary OCR job.

## Application tables

### `production_machine`

Machine master data.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key, auto-increment |
| `name` | `varchar(100)` | Display name |
| `machine_id` | `varchar(50)` | Unique business identifier |
| `type` | `varchar(50)` | Machine type |
| `ideal_cycle_time` | `double`, nullable | Target cycle time |
| `default_shift_time` | `int` | Default shift duration |
| `status` | `varchar(20)` | Current state |
| `active` | `tinyint(1)` | Active flag |
| `image` | `varchar(200)`, nullable | Image/storage path |

### `production_part`

Part master data.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key, auto-increment |
| `name` | `varchar(100)` | Display name |
| `part_number` | `varchar(50)` | Unique business identifier |
| `cycle_time` | `double` | Expected cycle time |
| `active` | `tinyint(1)` | Active flag |
| `image` | `varchar(200)`, nullable | Image/storage path |

### `production_die`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key, auto-increment |
| `name` | `varchar(100)` | Display name |
| `die_number` | `varchar(50)` | Unique business identifier |

### `production_operator`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key, auto-increment |
| `name` | `varchar(100)` | Operator name |
| `employee_id` | `varchar(50)` | Unique employee identifier |
| `role` | `varchar(50)` | Operator role |
| `active` | `tinyint(1)` | Active flag |

### `production_defectreason`

Configurable defect classifications. Scope lists are stored as JSON.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key, auto-increment |
| `category` | `varchar(100)` | Top-level category |
| `subcategory` | `varchar(100)` | Subcategory |
| `specific_reason` | `varchar(200)` | Specific defect reason |
| `machine_types` | `json` | Applicable machine types |
| `machine_ids` | `json` | Applicable machine identifiers |
| `part_ids` | `json` | Applicable part identifiers |
| `active` | `tinyint(1)` | Active flag |

### `production_downtimereasonitem`

Self-referencing downtime reason hierarchy.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key, auto-increment |
| `level` | `int` | Hierarchy depth |
| `name` | `varchar(100)` | Reason label |
| `requires_extra_field` | `tinyint(1)` | Whether the UI must collect another value |
| `extra_field_label` | `varchar(100)`, nullable | Label for the extra value |
| `machine_types` | `json` | Applicable machine types |
| `machine_ids` | `json` | Applicable machines |
| `active` | `tinyint(1)` | Active flag |
| `parent_id` | `bigint`, nullable | FK to this table's `id` |

### `production_processreason`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key, auto-increment |
| `name` | `varchar(100)` | Reason name |
| `description` | `longtext`, nullable | Description |
| `machine_types` | `json` | Applicable machine types |
| `machine_ids` | `json` | Applicable machines |
| `part_ids` | `json` | Applicable parts |
| `active` | `tinyint(1)` | Active flag |

### `production_productionrecord`

The central production/OEE fact table. Each row belongs to a machine and date/shift and records counters, output, performance, downtime, and defects.

| Column group | Columns |
|---|---|
| Identity | `id` |
| Context | `machine_id` (FK), `date`, `shift`, `operator_name` |
| Time and target | `planned_production_time`, `target_output` |
| Counters | `counter_start`, `counter_end`, `gross_count`, `excluded_shots` |
| Output | `net_production`, `total_count`, `good_count`, `defect_count` |
| Metrics | `performance`, `downtime` |
| Detail | `downtime_events` (JSON), `defects` (JSON), `notes` (nullable text) |
| Provenance | `ocr_job_id` (indexed string, not an FK), `timestamp` |

### `production_partproductionhistory`

Individual part-production result history.

| Column group | Columns |
|---|---|
| Identity | `id` |
| Context | `machine_id` (FK), `part_id` (nullable FK), `die` (nullable text), `operator_name`, `date`, `shift` |
| Result | `result`, `defect_category`, `defect_subcategory`, `defect_specific_reason`, `comment` |
| Provenance | `ocr_job_id` (indexed string, not an FK), `timestamp` |

`operator_name` and `die` are stored as text snapshots rather than foreign keys. This preserves historical labels if a reference record later changes.

### `production_downtimeeventhistory`

Individual downtime events.

| Column group | Columns |
|---|---|
| Identity | `id` |
| Context | `machine_id` (FK), `operator_name`, `date`, `shift` |
| Timing | `start_time`, `end_time`, `duration` |
| Classification | `reason_category`, `reason_subsystem`, `reason_component`, `reason_specific_item`, `reason_full_path` |
| Detail | `comment` |
| Provenance | `ocr_job_id` (indexed string, not an FK), `timestamp` |

### `production_scheduleddowntime`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key, auto-increment |
| `machine_id` | `bigint` | FK to `production_machine.id` |
| `date` | `date` | Scheduled date |
| `start_time` | `time(6)` | Start time |
| `end_time` | `time(6)` | End time |
| `duration` | `int` | Duration |
| `reason` | `varchar(200)` | Reason |
| `comment` | `longtext`, nullable | Free-text note |

### Many-to-many link tables

- `production_machine_supported_parts`: unique pairs of `machine_id` and `part_id`.
- `production_part_dies`: unique pairs of `part_id` and `die_id`.

Both tables have their own auto-increment primary key plus foreign keys to their linked records.

### `ocr_ocrjobrecord`

Tracks the workflow state for each OCR job. Document and result files live in S3.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key, auto-increment |
| `folder_name` | `varchar(200)` | Unique job/storage identifier |
| `display_name` | `varchar(300)` | User-facing name |
| `ocr_status` | `varchar(20)` | Overall OCR status |
| `ocr_stage` | `varchar(40)` | Current workflow stage |
| `import_status` | `varchar(20)` | Import state |
| `imported_at` | `datetime(6)`, nullable | First import timestamp |
| `last_imported_at` | `datetime(6)`, nullable | Latest import timestamp |
| `last_import_rejects` | `tinyint(1)` | Whether rejects were imported last time |
| `last_import_downtime` | `tinyint(1)` | Whether downtime was imported last time |
| `merged_json_hash` | `varchar(64)` | Digest used for change/deduplication checks |
| `metadata` | `json` | Job metadata |
| `created_at`, `updated_at` | `datetime(6)` | Audit timestamps |

Deleting an OCR job removes the job's database row and related S3 job files, but imported production/history rows are intentionally retained.

## Authentication and Django tables

The authentication schema is Django's standard user/group/permission model:

- `auth_user`: users, password hashes, account flags, names, email, and login timestamps.
- `auth_group`: named groups.
- `auth_permission`: permissions associated with `django_content_type`.
- `auth_group_permissions`, `auth_user_groups`, `auth_user_user_permissions`: unique many-to-many joins.
- `django_content_type`: model registry.
- `django_migrations`: applied migration history.
- `django_session`: session payloads and expiry timestamps.
- `django_admin_log`: admin change history.

The backup contains authentication hashes. It does not contain plaintext passwords, but it must still be treated as sensitive.

## Foreign keys

The live physical foreign keys are:

- `auth_group_permissions.permission_id` -> `auth_permission.id`
- `auth_group_permissions.group_id` -> `auth_group.id`
- `auth_permission.content_type_id` -> `django_content_type.id`
- `auth_user_groups.group_id` -> `auth_group.id`
- `auth_user_groups.user_id` -> `auth_user.id`
- `auth_user_user_permissions.permission_id` -> `auth_permission.id`
- `auth_user_user_permissions.user_id` -> `auth_user.id`
- `django_admin_log.content_type_id` -> `django_content_type.id`
- `django_admin_log.user_id` -> `auth_user.id`
- `production_downtimeeventhistory.machine_id` -> `production_machine.id`
- `production_downtimereasonitem.parent_id` -> `production_downtimereasonitem.id`
- `production_machine_supported_parts.machine_id` -> `production_machine.id`
- `production_machine_supported_parts.part_id` -> `production_part.id`
- `production_part_dies.die_id` -> `production_die.id`
- `production_part_dies.part_id` -> `production_part.id`
- `production_partproductionhistory.machine_id` -> `production_machine.id`
- `production_partproductionhistory.part_id` -> `production_part.id`
- `production_productionrecord.machine_id` -> `production_machine.id`
- `production_scheduleddowntime.machine_id` -> `production_machine.id`

## Backup artifacts

The database pull produced two local, owner-readable artifacts under `.local-backups/`, which is excluded from Git:

| Artifact | Purpose | Size | SHA-256 |
|---|---|---:|---|
| `nissan-oee-full-20261006-053140.json.gz` | Complete Django-model logical data export | 10,678 bytes | `87797a6992bc334ec0fb5e603a2e57561a14c92f61fd35cf4ae65cef22f7d571` |
| `nissan-oee-schema-20261006-053140.json` | Physical MySQL schema, keys, indexes, constraints, and exact row counts | 110,083 bytes | `7675b4b666c3dda0b98b4c54f094d6b35fb531f1388a36a7f52bf42d947becaf` |

The compressed data archive contains 546 Django model objects. The physical database contains 580 rows. The difference is expected: 26 `django_migrations` rows are not application data, and 8 rows in the two implicit many-to-many tables are represented inside their owning Django model objects in the fixture.

This is a complete Django-model logical export, not a native `mysqldump`. It is suitable for restoring through Django after applying compatible migrations. The separate schema JSON records the exact physical MySQL structure but is an inventory, not executable DDL. For disaster recovery of the RDS instance itself, continue to use RDS automated backups/snapshots; use this fixture for application-level migration or reconstruction.

## Security and handling

- Keep `.local-backups/` out of Git and other shared source repositories.
- Restrict access because the logical export includes user password hashes and operational production data.
- Do not paste the fixture into tickets, chats, or logs.
- Verify the recorded SHA-256 digest before using an artifact for restoration.
- Restore into an isolated database first and run application checks before replacing any live data.
