// The copy contract lives in supabase/functions/_shared/copySchema.js so that
// both runtimes share ONE definition: the Node pipeline (save.mjs, pull.mjs)
// imports it through here, and the Deno edge function that applies copy edits
// from Linear comments imports it directly.
//
// It moved rather than being duplicated on purpose. schema.mjs has always been
// "the validation boundary every worker's output must pass"; a second copy in
// the functions tree would have been a second answer to what valid copy means,
// and the two would drift the first time a field changed.
export {
  CTA_VARIANTS,
  COPY_FIELDS,
  POST_TYPE_BRIEFS,
  GUIDE_FIELDS,
  GUIDE_ARCHETYPE_BRIEFS,
  validateCopy,
  validateGuide,
  validateConversation,
} from '../../supabase/functions/_shared/copySchema.js';
