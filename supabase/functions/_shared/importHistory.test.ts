import { assertEquals } from 'jsr:@std/assert@1'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from './database.types.ts'
import { insertMissingHistory, type ImportedHistoryRow } from './importHistory.ts'

function row(tmdbId: number, mediaType: string, watchedAt: string): ImportedHistoryRow {
  return {
    user_id: 'user-1',
    tmdb_id: tmdbId,
    media_type: mediaType,
    title: `Title ${tmdbId}`,
    poster_path: null,
    watched_at: watchedAt,
  }
}

Deno.test('one-off history imports add only missing titles and keep the newest source row', async () => {
  const written: ImportedHistoryRow[][] = []
  const options: unknown[] = []
  const client = {
    from(table: string) {
      if (table !== 'history') throw new Error(`Unexpected table: ${table}`)
      return {
        select() {
          return {
            eq() {
              return {
                in() {
                  return Promise.resolve({
                    data: [{ tmdb_id: 1, media_type: 'movie' }],
                    error: null,
                  })
                },
              }
            },
          }
        },
        upsert(rows: ImportedHistoryRow[], upsertOptions: unknown) {
          written.push(rows)
          options.push(upsertOptions)
          return Promise.resolve({ count: rows.length, error: null })
        },
      }
    },
  } as unknown as SupabaseClient<Database>

  const result = await insertMissingHistory(client, 'user-1', [
    row(1, 'movie', '2026-01-01'),
    row(2, 'tv', '2025-01-01'),
    row(2, 'tv', '2026-02-01'),
  ])

  assertEquals(result, { importedCount: 1, alreadyCount: 1 })
  assertEquals(written, [[row(2, 'tv', '2026-02-01')]])
  assertEquals(options, [{
    onConflict: 'user_id,tmdb_id,media_type',
    ignoreDuplicates: true,
    count: 'exact',
  }])
})

Deno.test('one-off history imports batch writes and count rows skipped by a concurrent insert', async () => {
  const batchSizes: number[] = []
  const client = {
    from(table: string) {
      if (table !== 'history') throw new Error(`Unexpected table: ${table}`)
      return {
        select() {
          return {
            eq() {
              return {
                in() {
                  return Promise.resolve({ data: [], error: null })
                },
              }
            },
          }
        },
        upsert(rows: ImportedHistoryRow[]) {
          batchSizes.push(rows.length)
          return Promise.resolve({
            count: batchSizes.length === 1 ? rows.length : 0,
            error: null,
          })
        },
      }
    },
  } as unknown as SupabaseClient<Database>

  const rows = Array.from({ length: 201 }, (_, index) => row(index + 1, 'movie', '2026-01-01'))
  const result = await insertMissingHistory(client, 'user-1', rows)

  assertEquals(batchSizes, [200, 1])
  assertEquals(result, { importedCount: 200, alreadyCount: 1 })
})
