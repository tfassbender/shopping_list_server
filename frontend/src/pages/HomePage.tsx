import { HealthIndicator } from '../components/HealthIndicator'
import { t } from '../i18n/messages'

export function HomePage() {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold">{t('home.title')}</h2>
      <p className="text-gray-600 dark:text-gray-300">{t('home.subtitle')}</p>
      <HealthIndicator />
    </section>
  )
}
