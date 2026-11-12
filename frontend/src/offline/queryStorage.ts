import { defaultStorage } from './storage'

/** IndexedDB store of the persisted TanStack Query cache (spaces, catalog, members, ...). */
export const queryStorage = defaultStorage('queries')
