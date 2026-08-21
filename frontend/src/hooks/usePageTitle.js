import { useEffect } from 'react'

const BRAND = 'FBR Invoicing'

// Sets the browser tab title for the page it's called from — the app is a
// single-page app, so without this every route keeps whatever static
// <title> index.html shipped with, regardless of which page is open.
export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${BRAND}` : BRAND
  }, [title])
}
