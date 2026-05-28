-- Enable Supabase Realtime on Batch 1 + Batch 2 tables.
-- Batch 1 (high-pain): bookings, quotations, projects, billing_line_items, evoucher_line_items
-- Batch 2 (supporting): contacts, contracts, collections, evouchers, customers

ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE quotations;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE billing_line_items;
ALTER PUBLICATION supabase_realtime ADD TABLE evoucher_line_items;
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE collections;
ALTER PUBLICATION supabase_realtime ADD TABLE evouchers;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
