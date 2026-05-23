-- 110_quotation_inquiry_access_equivalence.sql
-- BD Inquiries and Pricing Quotations are department lenses over the same
-- quotations table. Read/create already included bd_inquiries in migration 097;
-- this keeps update/delete aligned with the same access-profile model.

drop policy if exists "quotations_update" on public.quotations;
drop policy if exists "quotations_delete" on public.quotations;

create policy "quotations_update" on public.quotations for update to authenticated
using (
  (
    public.current_user_has_module_permission('bd_inquiries','edit')
    or public.current_user_has_module_permission('pricing_quotations','edit')
    or public.current_user_has_module_permission('pricing_contracts','edit')
  )
  and public.current_user_can_view_record(
    coalesce(prepared_by, created_by),
    array['Business Development','Pricing','Operations','Accounting']::text[]
  )
)
with check (
  public.current_user_has_module_permission('bd_inquiries','edit')
  or public.current_user_has_module_permission('pricing_quotations','edit')
  or public.current_user_has_module_permission('pricing_contracts','edit')
);

create policy "quotations_delete" on public.quotations for delete to authenticated
using (
  (
    public.current_user_has_module_permission('bd_inquiries','delete')
    or public.current_user_has_module_permission('pricing_quotations','delete')
    or public.current_user_has_module_permission('pricing_contracts','delete')
  )
  and public.current_user_can_view_record(
    coalesce(prepared_by, created_by),
    array['Business Development','Pricing','Operations','Accounting']::text[]
  )
);
