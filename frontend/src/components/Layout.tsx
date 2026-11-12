import { Outlet } from 'react-router'
import { useTrackHistory } from './backNavigation'

/**
 * Page frame. Each page renders its own header bar (see `Page` in AppBar.tsx), because title, back
 * arrow and menu differ per page; the frame only fills the screen height.
 */
export function Layout() {
  useTrackHistory()
  return (
    <div className="flex min-h-dvh flex-col">
      <Outlet />
    </div>
  )
}
