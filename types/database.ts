// Auto-generate from Supabase with: npm run db:types
// This is the hand-written version until the Supabase project is live.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type AccountStatus = 'target' | 'warm' | 'hot' | 'active_deal' | 'customer' | 'inactive'
export type OpportunityStage = 'discovery' | 'qualified' | 'proposal' | 'pilot' | 'negotiation' | 'won' | 'lost'
export type ActivityType = 'email' | 'call' | 'meeting' | 'linkedin_comment' | 'linkedin_message' | 'linkedin_connection' | 'whatsapp' | 'intro' | 'note' | 'proposal' | 'event_meeting' | 'manual_research' | 'voice_note'
export type ActionType = 'ask_intro' | 'call' | 'send_email' | 'send_whatsapp' | 'linkedin_comment' | 'linkedin_connect' | 'linkedin_message' | 'attend_event' | 'research_buyer' | 'research_company' | 'prepare_meeting' | 'follow_up' | 'send_proposal' | 'review_pilot' | 'ask_referral' | 'wait'
export type ActionStatus = 'pending' | 'completed' | 'dismissed' | 'snoozed'
export type SignalType = 'hiring_acceleration' | 'hiring_deceleration' | 'commercial_hiring' | 'recruiter_vacancy' | 'repeated_role' | 'new_head_of_people' | 'warm_relationship' | 'overdue_followup' | 'proposal_no_response' | 'upcoming_meeting'
export type RoleCategory = 'commercial' | 'recruiter' | 'hr' | 'engineering' | 'operations' | 'leadership' | 'marketing' | 'other'
export type JobStatus = 'active' | 'removed'
export type ConnectorRunStatus = 'success' | 'partial' | 'failed' | 'skipped'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string
          name: string
          slug: string
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['projects']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['projects']['Insert']>
      }
      companies: {
        Row: {
          id: string
          project_id: string
          name: string
          normalized_name: string | null
          domain: string | null
          website_url: string | null
          linkedin_url: string | null
          google_place_id: string | null
          country: string
          region: string | null
          city: string | null
          industry: string | null
          employee_range: string | null
          employee_estimate: number | null
          icp_score: number | null
          account_score: number | null
          signal_score: number | null
          data_coverage_score: number | null
          account_status: AccountStatus
          current_metrics: Json
          last_signal_at: string | null
          last_enriched_at: string | null
          source: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['companies']['Row'], 'id' | 'normalized_name' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['companies']['Insert']>
      }
      people: {
        Row: {
          id: string
          project_id: string
          company_id: string | null
          first_name: string | null
          last_name: string | null
          full_name: string | null
          job_title: string | null
          role_category: RoleCategory | null
          email: string | null
          phone: string | null
          linkedin_url: string | null
          linkedin_id: string | null
          buyer_role: string | null
          is_decision_maker: boolean
          relationship_owner: string | null
          relationship_strength: number
          last_interaction_at: string | null
          source: string | null
          confidence: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['people']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['people']['Insert']>
      }
      opportunities: {
        Row: {
          id: string
          project_id: string
          company_id: string
          name: string | null
          stage: OpportunityStage
          potential_value: number | null
          currency: string
          probability: number
          pain: string | null
          champion_person_id: string | null
          economic_buyer_person_id: string | null
          decision_date: string | null
          decision_process: string | null
          competition: string | null
          next_step: string | null
          next_step_due_at: string | null
          current_blocker: string | null
          pilot_status: string | null
          pilot_success_metric: string | null
          lost_reason: string | null
          won_at: string | null
          lost_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['opportunities']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['opportunities']['Insert']>
      }
      activities: {
        Row: {
          id: string
          project_id: string
          company_id: string | null
          person_id: string | null
          opportunity_id: string | null
          activity_type: ActivityType
          direction: string | null
          occurred_at: string
          channel: string | null
          summary: string | null
          raw_reference: string | null
          extracted_intel: Json
          outcome: string | null
          next_step_detected: string | null
          created_by: string | null
          source: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['activities']['Row'], 'id' | 'created_at'> & { id?: string }
        Update: never
      }
      jobs: {
        Row: {
          id: string
          project_id: string
          company_id: string
          data_source_id: string
          title: string
          normalized_title: string | null
          department: string | null
          location: string | null
          location_city: string | null
          job_type: string | null
          role_category: RoleCategory
          source_url: string | null
          external_id: string | null
          status: JobStatus
          first_seen_at: string
          last_seen_at: string
          removed_at: string | null
          days_open: number
          content_hash: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['jobs']['Row'], 'id' | 'days_open' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['jobs']['Insert']>
      }
      signals: {
        Row: {
          id: string
          project_id: string
          company_id: string
          person_id: string | null
          signal_type: SignalType
          strength: number
          confidence: number
          reason: string
          evidence: Json
          detected_at: string
          expires_at: string | null
          status: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['signals']['Row'], 'id' | 'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['signals']['Insert']>
      }
      actions: {
        Row: {
          id: string
          project_id: string
          company_id: string
          person_id: string | null
          opportunity_id: string | null
          trigger_signal_id: string | null
          action_type: ActionType
          title: string
          description: string | null
          suggested_content: string | null
          priority_score: number
          urgency: number
          expected_impact: number
          estimated_minutes: number
          reason: Json
          status: ActionStatus
          due_at: string | null
          snoozed_until: string | null
          outcome: string | null
          outcome_notes: string | null
          outcome_logged_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['actions']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['actions']['Insert']>
      }
      connector_runs: {
        Row: {
          id: string
          project_id: string
          company_id: string
          data_source_id: string
          source_subscription_id: string | null
          started_at: string
          finished_at: string | null
          duration_ms: number | null
          status: ConnectorRunStatus | null
          records_fetched: number
          records_changed: number
          signals_created: number
          estimated_cost_eur: number
          llm_tokens_used: number
          llm_cost_eur: number
          error_message: string | null
          error_code: string | null
          retry_count: number
          meta: Json
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['connector_runs']['Row'], 'id' | 'created_at'> & { id?: string }
        Update: never
      }
      source_subscriptions: {
        Row: {
          id: string
          project_id: string
          company_id: string
          data_source_id: string
          enabled: boolean
          priority: Priority
          refresh_hours: number | null
          last_checked_at: string | null
          next_check_at: string
          last_success_at: string | null
          failure_count: number
          last_error: string | null
          consecutive_empty: number
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['source_subscriptions']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['source_subscriptions']['Insert']>
      }
      data_sources: {
        Row: {
          id: string
          name: string
          slug: string
          connector_type: string
          is_global: boolean
          enabled: boolean
          default_refresh_hours: number
          cost_type: string
          estimated_cost_per_1000_eur: number
          reliability_score: number
          requires_api_key: boolean
          config_schema: Json | null
          terms_verified_at: string | null
          terms_notes: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['data_sources']['Row'], 'id' | 'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['data_sources']['Insert']>
      }
    }
    Functions: {
      get_today_queue: {
        Args: { p_project_id: string; p_minutes_available?: number; p_limit?: number }
        Returns: Array<{
          action_id: string
          action_type: string
          title: string
          description: string | null
          company_name: string
          person_name: string | null
          priority_score: number
          estimated_minutes: number
          reason: Json
          cumulative_minutes: number
        }>
      }
      classify_job_role: {
        Args: { p_title: string }
        Returns: RoleCategory
      }
      schedule_next_check: {
        Args: { p_subscription_id: string; p_success: boolean; p_account_status?: string }
        Returns: void
      }
    }
  }
}
