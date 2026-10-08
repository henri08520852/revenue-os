// Single source of truth for opportunity stages — must match opportunities_stage_check (migration 017)
export const OPPORTUNITY_STAGES = ['discovery', 'erstgespraech', 'evaluation', 'proposal', 'negotiation', 'won', 'lost'] as const
export type OpportunityStageKey = typeof OPPORTUNITY_STAGES[number]

export const ACTIVE_OPPORTUNITY_STAGES: OpportunityStageKey[] = ['discovery', 'erstgespraech', 'evaluation', 'proposal', 'negotiation']

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStageKey, string> = {
  discovery:     'Discovery',
  erstgespraech: 'Erstgespräch',
  evaluation:    'Evaluation',
  proposal:      'Proposal',
  negotiation:   'Verhandlung',
  won:           'Gewonnen',
  lost:          'Verloren',
}

// Company lifecycle — set automatically by migration 019 triggers:
// target → warm (lead exists) → hot (open deal) → customer (deal won). inactive is manual only.
export const ACCOUNT_STATUSES = [
  { key: 'target',   label: 'Target',   bg: '#dbeafe', text: '#1d4ed8' },
  { key: 'warm',     label: 'Warm',     bg: '#fef3c7', text: '#92400e' },
  { key: 'hot',      label: 'Hot',      bg: '#ffedd5', text: '#c2410c' },
  { key: 'customer', label: 'Customer', bg: '#ede9fe', text: '#5b21b6' },
  { key: 'inactive', label: 'Inactive', bg: '#f3f4f6', text: '#6b7280' },
] as const
