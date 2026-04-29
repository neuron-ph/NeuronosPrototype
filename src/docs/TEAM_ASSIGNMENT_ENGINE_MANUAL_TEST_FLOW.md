# Team Assignment Engine Manual Test Flow

## Purpose
Validate the merged team assignment engine end to end:
- canonical customer assignment profiles
- contact overrides
- Operations booking default resolution
- booking assignment persistence
- save-as-default behavior
- legacy fallback behavior

This flow is written for manual QA in the current app.

## Preconditions
- The canonical migration `067_canonical_assignment_profiles.sql` has been applied.
- There are active users in:
  - Operations
  - Pricing
  - Business Development
  - Accounting
- There are active Operations teams with:
  - `team_memberships`
  - `team_role_eligibilities`
- `operational_services` and `service_assignment_roles` are populated for:
  - Forwarding
  - Brokerage
  - Trucking
  - Marine Insurance
  - Others
- You have at least:
  - 1 customer with no assignment profiles
  - 1 contact under that customer
  - 1 trade party / consignee / shipper usable in booking flows if applicable
- Tester account has permission to edit customer/contact assignment profiles and create bookings.

## Recommended Test Data

### Operations
- Team A
- Forwarding service manager
- Forwarding team leader
- Forwarding customs declarant

### Non-Operations
- 1 Pricing user
- 1 Business Development user
- 1 Accounting user

### Entities
- Customer: `QA Customer Alpha`
- Contact: `QA Contact Bravo`
- Optional trade party: `QA Consignee Charlie`

## Section 1: Customer Assignment Profiles

### 1.1 Empty-state check
1. Open `QA Customer Alpha`.
2. Go to the `Teams` tab.
3. Confirm the section title is `Assignment Profiles`.

Expected:
- No legacy split sections are shown.
- If no profiles exist yet, the empty state appears.
- There is an `Add Profile` action.

### 1.2 Add a Business Development profile
1. Click `Add Profile`.
2. Select department `Business Development`.
3. Add one role row:
   - Role: `Account Rep`
   - Assigned user: a BD user
4. Save.

Expected:
- The profile appears under the `Business Development` group.
- The saved role and user display correctly.
- Refreshing the page keeps the profile visible.

### 1.3 Add a Pricing profile
1. Click `Add Profile`.
2. Select department `Pricing`.
3. Assign one Pricing user.
4. Save.

Expected:
- The profile appears under `Pricing`.
- It persists after refresh.

### 1.4 Add an Operations Forwarding profile
1. Click `Add Profile`.
2. Select department `Operations`.
3. Select service type `Forwarding`.
4. Optionally select Team A.
5. Fill required Operations roles.
6. Save.

Expected:
- The profile appears under `Operations`.
- It shows `Forwarding` scope.
- The saved team and role assignments display correctly.

### 1.5 Duplicate profile prevention
1. Attempt to create another `Operations + Forwarding` profile for the same customer.

Expected:
- The UI blocks duplicate scope creation.
- The tester is told to edit the existing profile instead.

### 1.6 Edit an existing profile
1. Edit the customer’s Forwarding profile.
2. Change one assigned user.
3. Save.

Expected:
- The card updates immediately.
- Refresh preserves the new assignment.

### 1.7 Remove a profile
1. Remove the Pricing profile.
2. Refresh the page.

Expected:
- The profile no longer appears.
- Other profiles remain intact.

## Section 2: Contact Override Behavior

### 2.1 Inherited profile rendering
1. Open `QA Contact Bravo` under `QA Customer Alpha`.
2. Open the contact `Teams` tab.

Expected:
- The section title is `Assignment Profiles`.
- Customer profiles appear as inherited baselines.
- Cards show `Inherited` when no contact override exists.

### 2.2 Add a contact override on an inherited scope
1. On the contact page, choose the inherited `Business Development` profile.
2. Click `Override`.
3. Change the assigned BD user.
4. Save.

Expected:
- The card now shows `Overridden`.
- The override user is displayed instead of the inherited customer user.
- Refresh preserves the override.

### 2.3 Clear a contact override
1. On the overridden profile, click `Clear`.

Expected:
- The card returns to `Inherited`.
- The original customer assignment is shown again.
- Refresh preserves inherited state.

### 2.4 Contact-only override visibility
1. Create or migrate a contact-only override for a scope that has no customer base profile.
2. Open the contact `Teams` tab.

Expected:
- The override is still visible.
- It can be edited and cleared.
- It does not disappear simply because the customer has no matching base profile.

## Section 3: Operations Booking Resolution

### 3.1 Customer default resolution
1. Ensure `QA Customer Alpha` has an `Operations + Forwarding` profile.
2. Start creating a Forwarding booking for that customer.
3. Observe the assignment form.

Expected:
- The form uses `ServiceRoleAssignmentForm`.
- A `Customer default` badge appears.
- Team and role picks are prefilled from the customer profile.
- The service manager row is locked.

### 3.2 Department-level fallback
1. Remove the customer’s `Operations + Forwarding` service-specific profile.
2. Create a department-level `Operations` customer profile if your environment supports one.
3. Start a Forwarding booking again.

Expected:
- The form resolves from the department-level profile.
- The badge reflects customer/department fallback behavior.
- Matching role picks are prefilled where applicable.

### 3.3 Service default fallback
1. Remove both service-specific and department-level customer Operations defaults.
2. Start a Forwarding booking.

Expected:
- The form falls back to `Service default`.
- The service manager remains populated from `operational_services`.
- Role slots appear based on `service_assignment_roles`.
- User picks are empty unless auto-selected by team filtering.

### 3.4 Contact override precedence
1. Create a contact override for `Operations + Forwarding`.
2. Start a Forwarding booking for that customer and contact.

Expected:
- The contact override wins over the customer default.
- The badge reflects the higher-precedence source.
- The prefilled users match the contact override.

### 3.5 Trade-party default precedence
1. Create a trade-party default for `Operations + Forwarding`.
2. Create a booking using that trade party in a flow that passes `tradePartyProfileId`.

Expected:
- The trade-party default wins over the customer default.
- The badge shows `Trade-party default`.

## Section 4: Team Filtering and Eligibility

### 4.1 Team filter changes eligible users
1. Open an Operations booking form.
2. Select Team A.
3. Open each role dropdown.

Expected:
- Only users eligible for each role in Team A appear.
- Ineligible users do not appear.

### 4.2 Single eligible user auto-fill
1. Configure one role so Team A has only one eligible user.
2. Re-select Team A in the form.

Expected:
- That role auto-fills with the only eligible user.

### 4.3 Team change clears incompatible picks
1. Select Team A and choose valid users.
2. Switch to Team B where some selected users are no longer eligible.

Expected:
- Incompatible users are cleared.
- Compatible users remain.
- Newly single-eligible roles may auto-fill.

## Section 5: Booking Creation and Persistence

### 5.1 Create booking successfully
1. Complete all required Operations roles on a Forwarding booking.
2. Save the booking.

Expected:
- Booking creation succeeds.
- Success toast appears.
- Booking detail opens or becomes available.

### 5.2 Verify booking detail assignments
1. Open the created booking’s detail view.
2. Go to the booking info / assignment section.

Expected:
- The assigned team and users match the create form.
- The data is visible in the booking assignment section.

### 5.3 Verify canonical runtime persistence
1. Confirm the booking now has rows in `booking_assignments`.

Expected:
- There is one row per selected role.
- Role keys and user IDs match the form submission.

### 5.4 Verify legacy compatibility projection
1. Confirm the booking row still has:
   - `team_id`
   - `manager_id`
   - `supervisor_id`
   - `handler_id`
2. Verify list screens and detail screens still render correctly.

Expected:
- Legacy projection columns are in sync with canonical assignments.

### 5.5 Assignment persistence failure is fatal
1. Simulate a failure in `booking_assignments` persistence if possible.
2. Attempt booking creation.

Expected:
- The flow does not report success.
- The tester sees an error instead of a success state.
- There is no false-positive “booking created successfully” result when canonical assignment persistence failed.

## Section 6: Save-As-Default Behavior

### 6.1 Save customer default from booking create flow
1. Start an Operations booking for a customer with no existing service-specific profile.
2. Fill roles manually.
3. Check `Save as default for this customer`.
4. Save the booking.

Expected:
- Booking saves successfully.
- A customer `Operations + service` profile is written to canonical `assignment_profiles`.
- Starting a second booking for the same customer/service now prefills those users.

### 6.2 Save trade-party default from booking create flow
1. Start a booking using a trade party.
2. Fill roles.
3. Check `Save as default for this consignee/shipper`.
4. Save.

Expected:
- The trade-party default is persisted canonically.
- A later booking for the same trade party resolves from that profile.

## Section 7: Legacy Fallback Validation

### 7.1 Customer legacy fallback
1. Use a customer that has data only in `customer_team_profiles`, not yet in canonical tables.
2. Start a relevant booking flow or open a resolver-dependent form.

Expected:
- The form still resolves usable defaults.
- The engine does not fail simply because canonical rows are missing.

### 7.2 Contact legacy fallback
1. Use a contact that has only `contact_team_overrides` legacy data.
2. Open the contact `Teams` tab or a dependent flow.

Expected:
- The contact override still resolves and renders.

### 7.3 Client handler preference fallback
1. Use a customer/service with only old `client_handler_preferences` history and no richer profile.
2. Verify resolver behavior in a create flow.

Expected:
- If canonical backfill exists, it should resolve from canonical migrated data.
- If legacy-only fallback is still expected in this environment, the form should still be usable.

## Section 8: Booking Edit Flow

### 8.1 Edit an existing booking assignment
1. Open an existing Operations booking.
2. Edit one role in `BookingAssignmentSection`.
3. Save.

Expected:
- `booking_assignments` rows are replaced correctly.
- Legacy booking projection updates too.
- The updated assignment is visible after refresh.

### 8.2 Existing booking with no canonical rows
1. Open a booking that still only has legacy projection columns and no `booking_assignments`.

Expected:
- The screen still shows a sensible fallback state.
- Editing and saving should create canonical `booking_assignments`.

## Section 9: Permission and Visibility Checks

### 9.1 Allowed editor departments
1. Log in as a user from:
   - Business Development
   - Operations
   - Pricing
   - Accounting
   - Executive
2. Attempt to create or edit assignment profiles.

Expected:
- Allowed departments can edit.

### 9.2 Restricted departments
1. Log in as a user from a disallowed department.
2. Attempt the same actions.

Expected:
- Write actions are blocked by app behavior and/or RLS.

### 9.3 Booking visibility
1. Assign a booking to a user who is not on the legacy booking columns initially.
2. Confirm they can still see the booking where assignment-based visibility is expected.

Expected:
- Visibility works through `booking_assignments`.

## Section 10: Regression Checklist

Before signoff, confirm:
- Customer page shows one unified `Assignment Profiles` section.
- Contact page shows inherited profiles and overrides correctly.
- Contact-only overrides are visible.
- Operations booking forms prefill correctly.
- Source badges make sense.
- Team filtering works by eligibility.
- Save-as-default writes to canonical profiles.
- Booking creation writes canonical `booking_assignments`.
- Legacy booking columns remain in sync.
- Canonical-first resolution still falls back to legacy where expected.
- Refreshing screens preserves all saved states.

## Signoff Template

Use this format per environment:

- Environment:
- Tester:
- Date:
- Migration `067` applied: Yes / No
- Customer profile tests: Pass / Fail
- Contact override tests: Pass / Fail
- Operations resolution tests: Pass / Fail
- Booking create persistence tests: Pass / Fail
- Save-as-default tests: Pass / Fail
- Legacy fallback tests: Pass / Fail
- Permission tests: Pass / Fail
- Notes:
- Blockers:

