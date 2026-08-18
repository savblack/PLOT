// Plex's API answers in XML. These are the two shapes media-sync reads out of
// it, kept here so they can be unit-tested — parsePlexItems in particular is
// load-bearing: if its pattern stops matching, every sync quietly returns
// nothing at all rather than failing.

/**
 * Attribute map of a single tag, with XML entities decoded.
 *
 * @param {string} tag
 * @returns {Record<string, string>}
 */
export function xmlAttrs(tag) {
  const attrs = {}
  const attrPattern = /([A-Za-z_:][\w:.-]*)="([^"]*)"/g
  let match
  while ((match = attrPattern.exec(tag))) {
    attrs[match[1]] = match[2]
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
  }
  return attrs
}

/**
 * Library entries, each with its attributes and its `guids`.
 *
 * The guid list is why this parses element bodies at all: legacy Plex agents put
 * a real id in the guid attribute ("com.plexapp.agents.themoviedb://603"), but
 * the current one puts an opaque "plex://movie/…" there and lists the actual ids
 * in nested <Guid id="tmdb://603"/> children. Without them every title had to be
 * guessed from its name, which is how the wrong films got synced.
 *
 * Handles both the self-closing and the paired form. The body capture is lazy,
 * so it ends at this entry's own closing tag rather than swallowing later ones.
 *
 * @param {string} xml
 * @returns {(Record<string, string> & { guids: string[] })[]}
 */
export function parsePlexItems(xml) {
  const pattern = /<(Video|Directory)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g
  const items = []
  let match
  while ((match = pattern.exec(String(xml || '')))) {
    const attrs = xmlAttrs(`<${match[1]} ${match[2]}>`)
    const guids = [...String(match[4] || '').matchAll(/<Guid\s+[^>]*id="([^"]+)"/g)].map(m => m[1])
    if (attrs.guid) guids.push(attrs.guid)
    items.push({ ...attrs, guids })
  }
  return items.filter(item => item.title || item.grandparentTitle)
}

/**
 * Plex.tv server resources, each with its connection list.
 *
 * The return type is spelled out because this lands in a jsonb column
 * (media_integrations.plex_servers) — an inferred shape is not assignable to the
 * generated Json type.
 *
 * @param {string} xml
 * @returns {Record<string, string | Record<string, string>[]>[]}
 */
export function parsePlexResources(xml) {
  const resources = []
  const resourcePattern = /<Device\s+([^>]*?)>([\s\S]*?)<\/Device>/g
  let resourceMatch
  while ((resourceMatch = resourcePattern.exec(String(xml || '')))) {
    const attrs = xmlAttrs(`<Device ${resourceMatch[1]}>`)
    const connections = (resourceMatch[2].match(/<Connection\s+[^>]*>/g) || []).map(xmlAttrs)
    resources.push({ ...attrs, connections })
  }
  return resources
}
