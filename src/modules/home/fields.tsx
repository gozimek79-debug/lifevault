import type { DocumentType } from '../../lib/parse-document'
import type { DocumentDraft } from '../../lib/types'
import { useI18n, type MessageKey } from '../../i18n/context'

const types: DocumentType[] = ['invoice', 'receipt', 'warranty', 'manual', 'other']
const typeKey: Record<DocumentType, MessageKey> = {
  invoice: 'typeInvoice',
  receipt: 'typeReceipt',
  warranty: 'typeWarranty',
  manual: 'typeManual',
  other: 'typeOther',
}

export function typeLabel(type: DocumentType, t: (key: MessageKey) => string): string {
  return t(typeKey[type])
}

export function DocumentFields({
  value,
  onChange,
}: {
  value: DocumentDraft
  onChange: (next: DocumentDraft) => void
}) {
  const { t } = useI18n()
  const set = (patch: Partial<DocumentDraft>) => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-col gap-3">
      <label className="label" htmlFor="doc-type">
        {t('fieldType')}
      </label>
      <select
        id="doc-type"
        className="field"
        value={value.documentType}
        onChange={(event) => set({ documentType: event.target.value as DocumentType })}
      >
        {types.map((type) => (
          <option key={type} value={type}>
            {t(typeKey[type])}
          </option>
        ))}
      </select>
      <Field id="doc-title" label={t('fieldTitle')} value={value.title} onChange={(title) => set({ title })} />
      <Field id="doc-warranty" label={t('fieldWarrantyEnd')} type="date" value={value.warrantyEnd} onChange={(warrantyEnd) => set({ warrantyEnd })} />
      <Field id="doc-price" label={t('fieldPrice')} inputMode="decimal" value={value.priceAmount} onChange={(priceAmount) => set({ priceAmount })} />
      <label className="label" htmlFor="doc-currency">
        {t('fieldCurrency')}
      </label>
      <select id="doc-currency" className="field" value={value.priceCurrency} onChange={(event) => set({ priceCurrency: event.target.value })}>
        {['PLN', 'EUR', 'USD', 'GBP'].map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
      <Field id="doc-maker" label={t('fieldManufacturer')} value={value.manufacturer} onChange={(manufacturer) => set({ manufacturer })} />
      <Field id="doc-model" label={t('fieldModel')} value={value.model} onChange={(model) => set({ model })} />
      <Field id="doc-serial" label={t('fieldSerial')} value={value.serial} onChange={(serial) => set({ serial })} />
      <Field id="doc-vendor" label={t('fieldVendor')} value={value.vendor} onChange={(vendor) => set({ vendor })} />
      <Field id="doc-bought" label={t('fieldPurchaseDate')} type="date" value={value.purchaseDate} onChange={(purchaseDate) => set({ purchaseDate })} />
      <label className="label" htmlFor="doc-notes">
        {t('fieldNotes')}
      </label>
      <textarea id="doc-notes" className="field min-h-28" value={value.notes} onChange={(event) => set({ notes: event.target.value })} />
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  inputMode?: 'decimal'
}) {
  return (
    <>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="field" type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} />
    </>
  )
}
