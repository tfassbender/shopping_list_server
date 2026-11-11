import { Link } from 'react-router'
import { Page } from '../components/AppBar'
import { t } from '../i18n/messages'

export function NotFoundPage() {
  return (
    <Page title={t('notFound.title')} back="/">
      <div className="py-6">
        <Link to="/" className="font-semibold text-accent underline">
          {t('notFound.back')}
        </Link>
      </div>
    </Page>
  )
}
