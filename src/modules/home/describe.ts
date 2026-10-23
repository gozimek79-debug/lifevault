import type { Reminder, VaultDocument } from '../../lib/types'
import type { MessageKey } from '../../i18n/context'

type Translate = (key: MessageKey, vars?: Record<string, string>) => string

export function documentLines(document: VaultDocument, t: Translate, typeName: string): string[] {
  const price =
    document.priceAmount === null ? '' : `${document.priceAmount.toFixed(2)} ${document.priceCurrency ?? ''}`.trim()
  return [
    `${t('fieldType')}: ${typeName}`,
    `${t('fieldWarrantyEnd')}: ${document.warrantyEnd ?? '—'}`,
    `${t('fieldPrice')}: ${price || '—'}`,
    `${t('fieldManufacturer')}: ${document.manufacturer ?? '—'}`,
    `${t('fieldModel')}: ${document.model ?? '—'}`,
    `${t('fieldSerial')}: ${document.serial ?? '—'}`,
    `${t('fieldVendor')}: ${document.vendor ?? '—'}`,
    `${t('fieldPurchaseDate')}: ${document.purchaseDate ?? '—'}`,
    `${t('fieldNotes')}: ${document.notes || '—'}`,
  ]
}

export function reminderCopy(t: Translate) {
  return (reminder: Reminder) => ({
    title: t('reminderTitle', { title: reminder.title }),
    body: t('reminderBody', { days: String(reminder.daysBefore), date: reminder.dueOn }),
  })
}
