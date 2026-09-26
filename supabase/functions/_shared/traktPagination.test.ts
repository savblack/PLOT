import { readTraktPages } from './traktPagination.ts'

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message)
}

Deno.test('Trakt collection reads all pages beyond the former 100-record ceiling', async () => {
  const paths: string[] = []
  const rows = await readTraktPages('/users/me/history?start_at=2026-01-01', path => {
    paths.push(path)
    return new Response(JSON.stringify(Array(100).fill({ type: 'episode' })), {
      headers: { 'X-Pagination-Page-Count': '3' },
    })
  })
  assert(rows.length === 300, 'history was truncated')
  assert(paths[2].includes('page=3') && paths[2].includes('start_at='), 'lost pagination or incremental filter')
})

Deno.test('Trakt failed pages never report a successful partial collection', async () => {
  let calls = 0
  let rejected = false
  try {
    await readTraktPages('/users/me/history', () => {
      calls++
      return calls === 1
        ? new Response(JSON.stringify(Array(100).fill({})), { headers: { 'X-Pagination-Page-Count': '2' } })
        : new Response('', { status: 429 })
    })
  } catch { rejected = true }
  assert(rejected && calls === 2, 'rate limit must stop reconciliation')
})

Deno.test('Trakt page consumer receives a checkpoint and final completion', async () => {
  const checkpoints: (number | null)[] = []
  const rows = await readTraktPages('/users/me/history', () => new Response('[{}]', {
    headers: { 'X-Pagination-Page-Count': '2' },
  }), (_items, next) => { checkpoints.push(next) })
  assert(rows.length === 0, 'streamed pages should not be retained')
  assert(JSON.stringify(checkpoints) === '[2,null]', 'incorrect checkpoints')
})
