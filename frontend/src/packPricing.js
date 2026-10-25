// Pack pricing (admin-enabled per user — FbrSettings.pack_pricing): a product
// priced per pack, e.g. Rs 1,175 per Maund of 37.324 KG, invoiced in packs or
// in KG. Shared by the product form and the single-invoice form so both do
// the maths identically. FBR still gets the quantity in the product's UOM
// (KG) and values to 2 decimals — nothing new is sent to FBR.

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp

// Does this product use pack pricing? Only when the feature is on for the
// user AND the product has a pack price.
export function isPackPriced(product, enabled) {
  return !!enabled && product != null && product.pack_price != null && product.pack_price !== ''
}

// Per-UOM unit price from the pack price (8 dp — same as the server).
export function unitPriceFromPack(packPrice, packSize) {
  const price = Number(packPrice)
  const size = Number(packSize)
  if (packPrice === '' || packPrice == null || !(price >= 0) || !(size > 0)) return ''
  return String(round(price / size, 8))
}

// One invoice line of a pack-priced product. Entered either as packs (e.g.
// 1,079.73422 Maunds) or as KG (e.g. 40,300). Returns what's shown and sent:
//   packs    — maunds (5 dp, as on the factory's sheet)
//   quantity — KG for FBR (4 dp, FBR's limit; exactly the KG typed in KG mode)
//   value    — packs × price per pack (2 dp), or KG ÷ pack size × price when
//              KG was entered (exact, not via the rounded packs)
//   unitPrice — a per-KG price that makes quantity × unitPrice land exactly on
//               value, so the normal invoice pipeline needs no changes.
export function packLine({ mode, amount, packSize, packPrice }) {
  const size = Number(packSize)
  const entered = Number(amount)
  if (amount === '' || amount == null || !(entered > 0) || !(size > 0)) return null
  const packs = mode === 'kg' ? round(entered / size, 5) : entered
  const quantity = mode === 'kg' ? round(entered, 4) : round(entered * size, 4)
  // From the KG exactly (KG ÷ pack size × price) when KG was entered — the
  // shown 5-decimal packs are only for display; from the packs typed otherwise.
  const value = round(
    mode === 'kg' ? (entered * Number(packPrice)) / size : packs * Number(packPrice),
    2
  )
  const unitPrice = quantity > 0 ? (value / quantity).toFixed(12) : '0'
  return { packs, quantity, value, unitPrice }
}
