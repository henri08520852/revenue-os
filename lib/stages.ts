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
