// Stub — jobboard discovery not yet implemented
export async function runJobboardDiscovery(
  _supabase: any,
  _projectId: string,
): Promise<{ jobsScanned: number; candidatesCreated: number }> {
  return { jobsScanned: 0, candidatesCreated: 0 }
}
