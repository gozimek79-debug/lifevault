import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../app/auth'
import { getHousehold, listMembers } from '../lib/db'
import { inviteByEmail, renameHousehold } from '../lib/household'
import { canInvite, householdPlan, type PlanId } from '../lib/plans'
import type { HouseholdMember } from '../lib/types'
import { useI18n } from '../i18n/context'
import { ActionRow, PageIntro } from './chrome'

export function HouseholdScreen() {
  const { t } = useI18n()
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [plan, setPlan] = useState<PlanId>('solo')
  const [note, setNote] = useState<string | null>(null)

  async function reload() {
    if (!session) return
    const household = await getHousehold(session.householdId)
    setName(household?.name ?? 'Dom')
    setPlan(householdPlan(household))
    setMembers(await listMembers(session.householdId))
  }

  useEffect(() => {
    void reload()
  }, [session?.householdId])

  async function onRename(event: FormEvent) {
    event.preventDefault()
    if (!session) return
    await renameHousehold(session.householdId, name)
    setNote(t('saved'))
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault()
    if (!session) return
    setNote(null)
    try {
      const result = await inviteByEmail(session, email)
      setEmail('')
      await reload()
      setNote(result === 'demo' ? t('inviteDemo') : result === 'queued' ? t('inviteQueued') : t('inviteSaved'))
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : ''
      if (code === 'self') setNote(t('inviteSelf'))
      else if (code === 'email') setNote(t('inviteBadEmail'))
      else if (code === 'exists') setNote(t('inviteExists'))
      else if (code === 'plan') setNote(t(plan === 'solo' ? 'invitePlanLock' : 'invitePlanFull'))
      else setNote(t('inviteFailed'))
    }
  }

  const inviteOpen = canInvite(plan, members.length)

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageIntro title={t('householdTitle')} lede={t('saveNameHint')} />
      <form className="form-stack" onSubmit={(event) => void onRename(event)}>
        <label className="label" htmlFor="home-name">
          {t('householdName')}
        </label>
        <input id="home-name" className="field" value={name} onChange={(event) => setName(event.target.value)} />
        <ActionRow hint={t('saveNameHint')}>
          <button className="tap-ghost" type="submit">
            {t('saveName')}
          </button>
        </ActionRow>
      </form>
      <h2 className="text-2xl font-semibold">{t('members')}</h2>
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li key={member.id} className="card">
            <span className="block font-semibold">
              {member.email}
              {member.email === session?.email ? ` · ${t('you')}` : ''}
            </span>
            <span className="block">
              {member.role === 'owner' ? t('roleOwner') : t('roleMember')} · {member.inviteStatus === 'pending' ? t('pending') : t('accepted')}
            </span>
          </li>
        ))}
      </ul>
      <form className="form-stack" onSubmit={(event) => void onInvite(event)}>
        <label className="label" htmlFor="invite-email">
          {t('inviteEmail')}
        </label>
        <input id="invite-email" className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={!inviteOpen} />
        <ActionRow hint={inviteOpen ? t('inviteHint') : plan === 'solo' ? t('invitePlanLock') : t('invitePlanFull')}>
          <button className={inviteOpen ? 'tap-primary' : 'tap-ghost'} type="submit" disabled={!inviteOpen}>
            {t('invite')}
          </button>
        </ActionRow>
      </form>
      {note ? <p role="status">{note}</p> : null}
    </div>
  )
}
