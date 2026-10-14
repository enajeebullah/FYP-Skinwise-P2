# SkinWISE read-only code review

Review scope: login/authentication, skin and acne analysis, dashboard and routines, scan history, admin, doctor access, and appointments. This review used checked-in source and SQL only. No live Supabase, browser, deployment, or secret values were inspected.

## Confirmed findings

| # | Severity | File and location | Finding | Smallest proposed fix |
|---|---|---|---|---|
| 1 | HIGH | `components/AuthForm.tsx:14,53` (`handleSubmit`) | The post-login `redirectTo` value is taken from the URL and passed to `router.push()` without being restricted to an internal path. A crafted login link can redirect a user away from SkinWISE after authentication; unsafe schemes may also be interpreted by client navigation. | Accept only a validated internal relative path and otherwise use the default destination. |
| 2 | MEDIUM | `middleware.ts:4,33` (`middleware`) | Public routes are matched with `pathname.startsWith(p)`, while `PUBLIC_PATHS` contains `/`. Every normal pathname therefore matches as public and bypasses the middleware's unauthenticated redirect. Route-specific checks still apply where implemented. | Match `/` exactly and match other public entries exactly or at a path-segment boundary. |
| 3 | MEDIUM | `components/ConsultationHub.tsx:202-220,248-255`; `supabase/migration_add_consultations.sql:110-124` | The UI checks the 30-day booking limit and doctor schedule, but the patient insert policy checks only ownership, pending status, no meeting link, current-or-future date, and doctor active status. An authenticated patient can bypass the UI and submit a pending appointment outside the listed schedule or beyond 30 days. | Enforce required booking-window and schedule rules in a trusted server/database-side booking path. |
| 4 | MEDIUM | `lib/supabase/doctor.ts:5-27`; `supabase/migration_add_consultations.sql:139-168`; `components/AdminPanel.tsx:257-268` | Admin deactivation changes `is_active`, but the doctor page guard and doctor appointment read/update policies check linked `user_id` without requiring an active doctor. A deactivated linked doctor can still pass the guard and access/update appointments. | Include the active status in doctor access checks and the corresponding appointment policies. |
| 5 | MEDIUM | `components/Dashboard.tsx:62,133-143,171-183` | Dashboard recommendations are generated immediately with default safety flags, while the stored profile flags load asynchronously; the save action is not gated on that load. A user with saved contraindication flags can initially be shown a routine generated without them, and could save before the flags arrive. | Track safety-profile loading and do not present/save a routine as profile-aware until that load succeeds; surface load errors. |

## Confirmed behavior not classified as a defect

- Dashboard saves model `lesion_counts` and `total_lesions` alongside separate user-reviewed `confirmed_counts`. History currently reads and displays the model counts and total, not the confirmed values (`app/history/page.tsx`, `components/HistoryView.tsx`). Whether history should show confirmed or detected counts is a product expectation not established by the source, so this is not classified as a confirmed defect.
- Weather is requested through browser geolocation and is optional. Dashboard permits saving while the request is unresolved, so a saved scan may have null weather even if a later request succeeds. The code treats missing weather as supported; whether saving should wait needs a product decision.

## Requires live or browser verification

- FastAPI inference handlers do not show authentication, while the Next.js proxy does. The README documents binding the development server to localhost and keeping the production service private. Actual direct reachability depends on the deployed bind address and network controls and was not tested.
- The checked-in appointment migration describes policies, but the live Supabase project's applied migrations, RLS behavior, and database timezone were not queried.
- Browser timing and presentation should be tested to confirm how long default safety-based recommendations remain visible while the profile request is pending.

No code fixes were made as part of this review.

## Appointment chat attachment review (2026-10-14)

This static review covered `supabase/migration_add_appointment_chat_attachments.sql`,
`supabase/migration_add_appointment_chat.sql`, and
`components/AppointmentChat.tsx`. User-provided live checks reported eligible
participant INSERT/SELECT policies on `public.appointment_messages`, no rows
for the `storage.objects` policy query, and no row for the
`appointment-chat-attachments` bucket query. No SQL was executed and no live
settings were changed or independently queried.

### Finding

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟡 MEDIUM | `supabase/migration_add_appointment_chat_attachments.sql` | 196-218 | The attachment SELECT policy allows an eligible appointment participant to read matching objects in the appointment folder even when no message references them. Because the client uploads before inserting message metadata, a failed message insert or failed cleanup can leave an unlinked object readable by the other participant. | 8/10 |

No CRITICAL or HIGH issue was identified in this static review.

### Remaining verification limits

- The migration order is consultations schema, existing chat migration if
  needed, then attachment migration. The text-chat migration includes a guard
  against running after attachment support is present.
- The attachment migration creates a private bucket with a 10 MiB limit and
  allowed MIME metadata, and raises an exception if an existing bucket ID has
  unexpected settings. MIME allowlists and metadata checks do not verify file
  bytes or signatures.
- Upload and delete policies are scoped to eligible appointment participants;
  deletion additionally requires uploader ownership and no message reference.
  The client attempts Storage API cleanup after failures, but failed cleanup
  can leave orphaned objects.
- Live `storage.objects.owner_id` schema/behavior, effective grants and full
  policy composition, migration application state, and SQL runtime behavior
  were not independently verified. Other permissive live policies could widen
  access.
