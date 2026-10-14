// The exact CSV shape the FBR portal's bulk invoice upload expects
// (mirrors backend/app/services/csv_processor.py ALL_COLUMNS / REQUIRED_COLUMNS).
// Keep this in sync if that backend format ever changes.

export const TARGET_COLUMNS = [
  'pos_invoice_no',
  'invoice_date',
  'buyer_ntn_cnic',
  'buyer_name',
  'buyer_province',
  'buyer_address',
  'buyer_registration_type',
  'product_description',
  'hs_code',
  'rate',
  'uom',
  'quantity',
  'unit_price',
  'sale_type',
  'scenario_id',
  'fixed_notified_value',
  'sro_schedule_no',
  'sro_item_serial_no',
  // Optional amount columns — map 1:1 to the matching PRAL invoice/item
  // JSON keys. Written explicitly as 0 (rather than left blank) for every
  // column this conversion doesn't derive from the source data, matching
  // how the portal's own reference file shows them.
  'invoice_ref_no',
  'sales_tax',
  'sales_tax_withheld_at_source',
  'extra_tax',
  'further_tax',
  'fed_payable',
  'discount',
  'total_values',
  'advance_tax',
]

export const REQUIRED_COLUMNS = [
  'pos_invoice_no',
  'invoice_date',
  'product_description',
  'hs_code',
  'quantity',
  'unit_price',
]
