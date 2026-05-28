export interface TemplateItemEntry {
  catalog_item_id: string;
  description: string;
}

export interface CategoryTemplate {
  id: string;
  name: string;
  description?: string;
  category_name: string;
  catalog_category_id?: string;
  items: TemplateItemEntry[];
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}
