-- Allow authors to edit their own chronological log entries.
-- (Edit-button visibility is RBAC-gated client-side via ops_bookings_chrono_tab:edit.)
CREATE POLICY "booking_chrono_logs_update" ON booking_chronological_logs
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
