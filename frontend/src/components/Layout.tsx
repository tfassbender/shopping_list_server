import { Outlet } from 'react-router'
import { t } from '../i18n/messages'

/** Page frame: top bar + content. Mobile-first: full width on phones, centered column on larger screens. */
export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-green-600 text-white shadow dark:bg-green-800">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <h1 className="text-lg font-semibold">{t('appName')}</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
