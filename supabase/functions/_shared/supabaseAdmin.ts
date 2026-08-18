import { createClient } from 'npm:@supabase/supabase-js@2'
import { serviceKey } from './serviceKey.ts'

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey(),
  )
}
