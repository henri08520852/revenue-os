import Anthropic from '@anthropic-ai/sdk'

// Keys that are not scoped to a workspace need the workspace id as a header (env ANTHROPIC_WORKSPACE_ID, optional)
export function anthropicClient(apiKey?: string) {
  const ws = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  return new Anthropic({ ...(apiKey ? { apiKey } : {}), ...(ws ? { defaultHeaders: { 'anthropic-workspace-id': ws } } : {}) })
}
