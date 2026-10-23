import { getSupabase, supabaseConfigured } from './supabase'
import { enqueueJob, getHousehold, listMembers, putHousehold, putMember } from './db'
import type { HouseholdMember, Session } from './types'

interface MemberRow {
  id: string
  household_id: string
  user_id: string | null
  email: string
  role: 'owner' | 'member'
  invite_status: 'pending' | 'accepted'
  created_at: string
}

/** Po zalogowaniu: przyjmij zaproszenie, albo weź istniejący dom, albo załóż nowy. */
export async function ensureRemoteHousehold(userId: string, email: string): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('config')
  const accepted = await supabase.rpc('accept_household_invite')
  if (accepted.error) throw new Error('household')
  let householdId = typeof accepted.data === 'string' ? accepted.data : null
  if (!householdId) {
    const existing = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .eq('invite_status', 'accepted')
      .limit(1)
      .maybeSingle()
    if (existing.error) throw new Error('household')
    const row = existing.data as { household_id?: string } | null
    householdId = row?.household_id ?? null
  }
  if (!householdId) {
    const created = await supabase.rpc('create_household', { household_name: 'Dom' })
    if (created.error || typeof created.data !== 'string') throw new Error('household')
    householdId = created.data
  }
  const household = await supabase.from('households').select('id, name, created_at').eq('id', householdId).maybeSingle()
  const householdRow = household.data as { name?: string; created_at?: string } | null
  await putHousehold({
    id: householdId,
    name: householdRow?.name ?? 'Dom',
    createdAt: householdRow?.created_at ?? new Date().toISOString(),
  })
  const members = await supabase.from('household_members').select('*').eq('household_id', householdId)
  const rows = (members.data ?? []) as MemberRow[]
  if (rows.length === 0) {
    await putMember({
      id: crypto.randomUUID(),
      householdId,
      userId,
      email,
      role: 'owner',
      inviteStatus: 'accepted',
      createdAt: new Date().toISOString(),
    })
  } else {
    for (const row of rows) await putMember(mapMember(row))
  }
  return householdId
}

export async function renameHousehold(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const current = await getHousehold(id)
  if (!current) return
  await putHousehold({ ...current, name: trimmed })
  const supabase = getSupabase()
  if (!supabase || !navigator.onLine) return
  await supabase.from('households').update({ name: trimmed }).eq('id', id)
}

export async function inviteByEmail(session: Session, email: string): Promise<'demo' | 'saved' | 'queued'> {
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('email')
  if (normalized === session.email.toLowerCase()) throw new Error('self')
  const existing = await listMembers(session.householdId)
  if (existing.some((member) => member.email.toLowerCase() === normalized)) throw new Error('exists')
  const member: HouseholdMember = {
    id: crypto.randomUUID(),
    householdId: session.householdId,
    userId: null,
    email: normalized,
    role: 'member',
    inviteStatus: 'pending',
    createdAt: new Date().toISOString(),
  }
  if (!supabaseConfigured()) {
    await putMember(member)
    return 'demo'
  }
  const supabase = getSupabase()
  if (!supabase || !navigator.onLine) {
    await putMember(member)
    await enqueueJob({
      id: `invite:${member.id}`,
      kind: 'invite',
      memberId: member.id,
      householdId: member.householdId,
      attempts: 0,
      lastError: null,
    })
    return 'queued'
  }
  const invited = await supabase.rpc('invite_household_member', {
    hid: session.householdId,
    invite_email: normalized,
  })
  if (invited.error) throw new Error('invite')
  if (typeof invited.data === 'string') member.id = invited.data
  await putMember(member)
  return 'saved'
}

function mapMember(row: MemberRow): HouseholdMember {
  return {
    id: row.id,
    householdId: row.household_id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    inviteStatus: row.invite_status,
    createdAt: row.created_at,
  }
}
