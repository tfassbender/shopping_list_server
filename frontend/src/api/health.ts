import { useQuery } from '@tanstack/react-query'
import { apiRequest } from './client'

export interface Health {
  status: string
  version: string
}

/** Server health, re-checked every 30 seconds. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiRequest<Health>('/api/health'),
    refetchInterval: 30_000,
    retry: false,
  })
}
