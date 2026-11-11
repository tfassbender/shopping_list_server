/**
 * The list opened last on this device - marked on the start page and preselected as space for new lists.
 * Per device (localStorage), because it is about where you are shopping right now.
 */
const KEY = 'shoppinglist.lastList'

export interface LastList {
  spaceId: string
  listId: string
}

export function getLastList(): LastList | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LastList | null
    return value?.spaceId && value.listId ? value : null
  } catch {
    return null
  }
}

export function setLastList(value: LastList) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // storage unavailable (private mode): just not remembered
  }
}
