import type { UiResource } from '@/lib/i18n'

// Makes t('some.key') a compile error when the key is not in en.json.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: UiResource }
  }
}
