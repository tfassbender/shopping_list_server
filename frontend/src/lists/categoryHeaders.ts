const STORAGE_KEY = 'shoppinglist.categoryHeaders'

/**
 * Whether lists show category headers (default) or only a colored bar per item. A quick view setting on
 * this device for all lists - like the chosen shop, it is not synced.
 */
export function categoryHeadersShown(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true // storage unavailable (private mode): default view
  }
}

export function rememberCategoryHeaders(shown: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(shown))
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
}
