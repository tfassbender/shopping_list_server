import { useHealth } from '../api/health'
import { t } from '../i18n/messages'

export function HealthIndicator() {
  const { data, isPending, isError } = useHealth()

  if (isPending) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{t('health.checking')}</p>
  }
  if (isError) {
    return <p className="text-sm text-red-600 dark:text-red-400">{t('health.offline')}</p>
  }
  return (
    <p className="text-sm text-green-700 dark:text-green-400">{t('health.online', { version: data.version })}</p>
  )
}
