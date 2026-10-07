# Modification Log

## 6 October 2026

| File | Reason for modification |
| --- | --- |
| `backend/db.sqlite3` | Populated the local-only development database with June-November 2026 production records, varied OEE data, defect history, mock operators and machines, and downtime events for every shift. Shift notes were standardised to `OEE development data`, and mock employee IDs were changed to `001`-`006`. No AWS RDS data was modified. |
| `backend/production/models.py` | Added indexed `is_mock` database flags to operators, machines, shift records, part-production history, and downtime-event history so generated development data can be identified without relying on display text. |
| `backend/production/migrations/0007_add_is_mock_flags.py` | Added the schema migration for the five mock-data flags. The migration defaults all rows to `false`; only the local SQLite rows are marked separately. |
| `backend/production/serializers.py` | Excluded `is_mock` from API responses and writes because the flag is database-only and does not need to appear in the frontend. |
| `backend/db.sqlite3` | Marked the injected local development rows with `is_mock = true`: six mock operators, three added machines, 3,843 generated shift records, 21,461 linked part-history rows, and 8,507 linked downtime events. Existing rows remain `false`; AWS RDS was not accessed. |
| `frontend/src/components/Dashboard.tsx` | Changed the Downtime Pareto grouping and display label to use the final segment of each downtime reason path. For example, `Setup > Part Change` is now shown as `Part Change`, while the complete hierarchy remains stored and available elsewhere in the application. |
| `frontend/src/App.tsx` | Added request-by-request startup loading progress and an actionable retry state. The loader is a compact, bright blocking card over a dark translucent backdrop, leaving the normal page layout visible underneath. Removed automatic full data reloads on every tab change to avoid repeatedly downloading the large history tables. Added a header `Refresh Data` button immediately before the date with live reload progress. |
| `frontend/src/index.css` | Standardised all native date inputs to a light control scheme and applied a visible dark calendar glyph directly to the clickable native picker indicator. This removes the large empty gap between the date and icon while keeping the icon itself clickable. The fix applies consistently to Dashboard, History, Operator Setup, Scheduled Downtime, and Shift Records date selectors. |
| `backend/production/views.py` | Added optional inclusive `start_date` and `end_date` filtering to the three large operational-data endpoints, plus a lightweight date-bounds endpoint for date selectors. This lets local development load only the records a screen needs instead of downloading all history. |
| `frontend/src/services/api.ts` | Added query-parameter support to list requests and exposed the operational date-bounds endpoint. |
| `frontend/src/App.tsx` | Changed startup loading to fetch only today and the preceding six days for shift records, part history, and downtime events. Additional ranges are fetched on demand, merged into an in-memory cache, and skipped when already loaded; manual refresh reloads the cached ranges. |
| `frontend/src/App.tsx` | Removed the blocking loading screen after the date-scoped loading made requests fast. The header refresh button retains a compact spinner and disabled state while a request is active, and failures continue to appear as toast messages. |
| `frontend/src/components/Dashboard.tsx` | Connected every dashboard date selector to on-demand range loading and used database-wide bounds so dates outside the initial seven-day window remain selectable. |
| `frontend/src/components/ProductionRecordManagement.tsx` | Connected the Shift Records date range to on-demand loading while keeping its three-day default inside the initial seven-day cache. |
| `frontend/src/components/HistoricalData.tsx` | Defaulted History to the same seven-day startup window and connected its date filters to on-demand loading. |
| `MODIFICATIONS.md` | Added this log so local changes and their purpose are documented in the repository. |

## 7 October 2026

| File | Reason for modification |
| --- | --- |
| `frontend/src/components/Dashboard.tsx` | Added independent date selectors to the single-date dashboard charts, with each selector defaulting to today. Added a date-range selector to OEE Trend. OEE Trend continues to plot one point per date using the arithmetic mean of the OEE values from all production records on that date. Added Downtime Pareto, Defect Pareto, and OEE Component Trend charts. All seven chart cards can now be collapsed and expanded independently. Pareto charts show descending bars only; cumulative lines were removed. Each Pareto keeps the nine largest categories and groups the remainder as `Other`. Downtime Pareto labels use the final segment of the reason path. |
| `frontend/src/components/ProductionRecordManagement.tsx` | Added a Shift Records date-range selector aligned to the right of the page heading. It defaults to today and the previous two days, filters displayed records inclusively, and requests an uncached range on demand when either date changes. |
| `frontend/src/App.tsx` | Fixed the blank operator page shown after **Start Shift**. The cause was that a fresh operator login retained `activeTab = "dashboard"`, but the operator view only renders the `entry` panel. Operator login and `handleStartWork` now explicitly select `entry`, while manager login explicitly selects `dashboard`. |
| AWS RDS `nissan_oee` schema | Created encrypted snapshot `nissan-oee-pre-mock-import-20261007-015745`, applied migration `production.0007_add_is_mock_flags`, and transactionally imported 6 mock operators, 3 mock machines, 3,843 mock shift records, 21,461 mock part-history rows, and 8,507 mock downtime rows. Existing non-mock counts were verified unchanged, and temporary S3/EC2 transfer files were removed. |
| `AWS_DEPLOYMENT_SUMMARY.md` | Documented the 7 October 2026 mock-data import, recovery snapshot, schema migration, verified mock/non-mock counts, API exclusion, and staging cleanup. |

## Deployment notes for these changes

- Deploy the frontend dashboard and date-selector changes together with the backend date-range API changes documented above.
- The frontend now expects inclusive `start_date` and `end_date` query parameters on `/api/records/`, `/api/part-production-history/`, and `/api/downtime-event-history/`.
- The frontend also expects the lightweight `/api/records/date-bounds/` endpoint.
- Rebuild the frontend assets as part of deployment.
- Do **not** deploy the locally populated `backend/db.sqlite3`; it contains development-only records.
- See `HANDOVER.md` for the broader AWS and OCR deployment changes. Those details are not duplicated here.

## Verification completed

- `npm run build` passed after the operator navigation fix.
- Vite still reports its existing large-chunk warning; this is non-blocking and did not fail the build.

## Verification approach

- Use the running Vite development environment to verify frontend changes.
- Before deployment, rerun `npm run build` in `frontend/` and the backend checks listed in `HANDOVER.md` against the final working tree.
