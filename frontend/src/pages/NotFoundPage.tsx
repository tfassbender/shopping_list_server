import { Link } from 'react-router'
import { t } from '../i18n/messages'

export function NotFoundPage() {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold">{t('notFound.title')}</h2>
      <Link to="/" className="text-green-700 underline dark:text-green-400">
        {t('notFound.back')}
      </Link>
    </section>
  )
}
