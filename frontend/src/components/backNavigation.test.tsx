import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useNavigationType } from 'react-router'
import { useGoBack, useTrackHistory } from './backNavigation'

function Frame({ children }: { children: React.ReactNode }) {
  useTrackHistory()
  return (
    <>
      <p data-testid="navigation">{useNavigationType()}</p>
      {children}
    </>
  )
}

function Back({ to }: { to: string }) {
  const goBack = useGoBack(to)
  return <button onClick={goBack}>Back</button>
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Frame>
        <Routes>
          <Route path="/" element={<><h1>Start</h1><Link to="/list">Open list</Link></>} />
          <Route path="/list" element={<><h1>List</h1><Back to="/" /></>} />
        </Routes>
      </Frame>
    </MemoryRouter>,
  )
}

describe('back navigation', () => {
  it('goes back in the history when the previous page is the target (no new entry)', async () => {
    renderAt('/')
    await userEvent.click(screen.getByRole('link', { name: 'Open list' }))
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByRole('heading', { name: 'Start' })).toBeInTheDocument()
    expect(screen.getByTestId('navigation')).toHaveTextContent('POP')
  })

  it('replaces the current entry when the page was opened directly (deep link)', async () => {
    renderAt('/list')
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByRole('heading', { name: 'Start' })).toBeInTheDocument()
    expect(screen.getByTestId('navigation')).toHaveTextContent('REPLACE')
  })
})
