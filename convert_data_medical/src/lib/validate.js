import { REQUIRED_COLUMNS } from './targetSchema'

const OPTIONAL_NUMERIC_COLUMNS = [
  'fixed_notified_value',
  'sales_tax',
  'sales_tax_withheld_at_source',
  'extra_tax',
  'further_tax',
  'fed_payable',
  'discount',
  'total_values',
  'advance_tax',
]

// Mirrors the backend's own row checks (csv_processor.py _validate_and_collect)
// so a file that passes here won't get rejected by the portal for a missing
// required field or a non-numeric/malformed value.
export function validateRows(rows) {
  const issues = []
  rows.forEach((row, rowIndex) => {
    for (const column of REQUIRED_COLUMNS) {
      if (row[column] === '' || row[column] === null || row[column] === undefined) {
        issues.push({ rowIndex, column, message: `${column} is required` })
      }
    }
    if (row.quantity !== '' && Number.isNaN(Number(row.quantity))) {
      issues.push({ rowIndex, column: 'quantity', message: 'must be a number' })
    }
    if (row.unit_price !== '' && Number.isNaN(Number(row.unit_price))) {
      issues.push({ rowIndex, column: 'unit_price', message: 'must be a number' })
    }
    for (const column of OPTIONAL_NUMERIC_COLUMNS) {
      if (row[column] && Number.isNaN(Number(row[column]))) {
        issues.push({ rowIndex, column, message: 'must be a number' })
      }
    }
    if (row.invoice_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.invoice_date)) {
      issues.push({ rowIndex, column: 'invoice_date', message: 'must be YYYY-MM-DD' })
    }
  })
  return issues
}
