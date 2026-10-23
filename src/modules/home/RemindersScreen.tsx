import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth'
import { getPush, listReminders } from '../../lib/db'
import { googleCalendarUrl, remindersToIcs } from '../../lib/calendar'
import { downloadBlob } from '../../lib/download'
import { enableReminders, scheduleStoredReminders } from '../../lib/notifications'
import type { PushRecord, Reminder } from '../../lib/types'
import { useI18n } from '../../i18n/context'
import { reminderCopy } from './describe'

export function RemindersScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n()
  const { session } = useAuth()
  const [rows, setRows] = useState<Reminder[]>([])
  const [push, setPush] = useState<PushRecord | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    void listReminders(session.householdId).then(setRows)
    void getPush(session.userId).then(setPush)
    void scheduleStoredReminders(session.householdId, reminderCopy(t))
  }, [session, t])

  function downloadIcs() {
    const ics = remindersToIcs(
      rows.map((row) => ({
        uid: row.id,
        date: row.remindOn,
        title: t('reminderTitle', { title: row.title }),
        description: t('reminderBody', { days: String(row.daysBefore), date: row.dueOn }),
      })),
    )
    downloadBlob('lifevault-przypomnienia.ics', new Blob([ics], { type: 'text/calendar' }))
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <button className="tap-ghost" type="button" onClick={onBack}>
        {t('back')}
      </button>
      <h1 className="text-3xl font-semibold">{t('remindersTitle')}</h1>
      <button
        className="tap-primary"
        type="button"
        onClick={() => {
          if (!session) return
          void enableReminders(session.userId, session.householdId).then(async (result) => {
            if (result === 'granted') {
              await scheduleStoredReminders(session.householdId, reminderCopy(t))
              setPush(await getPush(session.userId))
              setNote(t('remindersOn'))
            } else if (result === 'denied') setNote(t('notifDenied'))
            else setNote(t('notifUnsupported'))
          })
        }}
      >
        {t('enableReminders')}
      </button>
      <p>{push?.status === 'subscribed' ? t('pushOn') : push?.status === 'pending' ? t('pushPending') : t('pushOff')}</p>
      {note ? <p role="status">{note}</p> : null}
      {rows.length === 0 ? <p>{t('noReminders')}</p> : null}
      {rows.length > 0 ? (
        <button className="tap-ghost" type="button" onClick={downloadIcs}>
          {t('downloadIcs')}
        </button>
      ) : null}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id} className="card flex flex-col gap-2">
            <span className="text-xl font-semibold">{row.title}</span>
            <span>{t('daysBefore', { days: String(row.daysBefore) })}</span>
            <span>{t('warrantyEnds', { date: row.dueOn })}</span>
            <span>{row.remindOn}</span>
            <a
              className="tap-ghost"
              href={googleCalendarUrl(
                t('reminderTitle', { title: row.title }),
                row.remindOn,
                t('reminderBody', { days: String(row.daysBefore), date: row.dueOn }),
              )}
              target="_blank"
              rel="noreferrer"
            >
              {t('googleCalendar')}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
