import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import { AppRoutes } from './App'
import { renderWithProviders } from './test/render'

function mockFetch(response: Response | Error) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
}

describe('App', () => {
  it('shows the server version when the backend is up', async () => {
    mockFetch(new Response(JSON.stringify({ status: 'UP', version: '1.2.3' }), { status: 200 }))

    renderWithProviders(<AppRoutes />)

    expect(await screen.findByText(/version 1\.2\.3/)).toBeInTheDocument()
  })

  it('shows an offline hint when the backend is not reachable', async () => {
    mockFetch(new TypeError('Failed to fetch'))

    renderWithProviders(<AppRoutes />)

    expect(await screen.findByText('Server not reachable')).toBeInTheDocument()
  })

  it('shows the not found page for unknown routes', () => {
    mockFetch(new TypeError('Failed to fetch'))

    renderWithProviders(<AppRoutes />, '/does/not/exist')

    expect(screen.getByText('Page not found')).toBeInTheDocument()
  })
})
