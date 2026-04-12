-- Migration 032: Fix catalog usage counts to include expense-side line items
-- Previously only counted billing_line_items; now also counts evoucher_line_items

CREATE OR REPLACE FUNCTION get_catalog_usage_counts()
RETURNS TABLE(catalog_item_id text, usage_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT catalog_item_id, SUM(cnt)::bigint AS usage_count
  FROM (
    SELECT catalog_item_id, COUNT(*) AS cnt
    FROM billing_line_items
    WHERE catalog_item_id IS NOT NULL
    GROUP BY catalog_item_id
    UNION ALL
    SELECT catalog_item_id, COUNT(*) AS cnt
    FROM evoucher_line_items
    WHERE catalog_item_id IS NOT NULL
    GROUP BY catalog_item_id
  ) combined
  GROUP BY catalog_item_id;
$$;
