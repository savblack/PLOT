#!/usr/bin/env node
/**
 * Builds the agent skills discovery index for the marketing site.
 *
 * Single source of truth: the SKILL.md files themselves, at
 * apps/website/.well-known/agent-skills/<name>/SKILL.md. Each one's `name` and
 * `description` come from its YAML front matter, and its `digest` is the
 * SHA-256 of the file as served. The index is generated from all of them.
 *
 * The digest is the reason this is a build step rather than a hand-written
 * file. It is how a consumer checks it received the skill PLOT published, so a
 * digest that no longer matches its SKILL.md is worse than no digest at all:
 * a careful client rejects the skill, and a careless one is no better off than
 * if we had never published it. Editing a SKILL.md by hand and forgetting the
 * index is the obvious way to get there, so CI runs --check.
 *
 * Usage:
 *   node scripts/build-agent-skills.mjs          # regenerate index.json
 *   node scripts/build-agent-skills.mjs --check  # verify it is current (CI); exit 1 if not
 *
 * Discovery RFC v0.2.0: https://github.com/cloudflare/agent-skills-discovery-rfc
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(ROOT, 'apps', 'website', '.well-known', 'agent-skills');
const INDEX = join(SKILLS_DIR, 'index.json');
const ORIGIN = 'https://theplot.tv';
const SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

const check = process.argv.includes('--check');

/** `name` and `description` out of a SKILL.md's YAML front matter. */
function frontMatter(source, rel) {
  const block = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!block) throw new Error(`${rel}: no front matter. Every SKILL.md needs name and description.`);
  const field = (key) => {
    const match = block[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    if (!match) throw new Error(`${rel}: front matter has no ${key}`);
    return match[1].trim().replace(/^["']|["']$/g, '');
  };
  return { name: field('name'), description: field('description') };
}

const skills = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((directory) => {
    const rel = `.well-known/agent-skills/${directory}/SKILL.md`;
    const source = readFileSync(join(SKILLS_DIR, directory, 'SKILL.md'), 'utf8');
    const { name, description } = frontMatter(source, rel);
    if (name !== directory) {
      throw new Error(`${rel}: front matter says name "${name}" but the directory is "${directory}". They are the same identifier.`);
    }
    return {
      name,
      type: 'skill-md',
      description,
      url: `${ORIGIN}/${rel}`,
      digest: `sha256:${createHash('sha256').update(source).digest('hex')}`,
    };
  });

if (!skills.length) throw new Error(`${SKILLS_DIR} has no skills in it`);

const next = `${JSON.stringify({ $schema: SCHEMA, skills }, null, 2)}\n`;
const current = (() => {
  try {
    return readFileSync(INDEX, 'utf8');
  } catch {
    return null;
  }
})();

if (current === next) {
  console.log(`agent skills index is current (${skills.length} skills)`);
} else if (check) {
  console.error('✗ .well-known/agent-skills/index.json is out of date. Run `npm run skills` and commit.');
  process.exit(1);
} else {
  writeFileSync(INDEX, next);
  console.log(`• wrote index.json (${skills.length} skills)`);
}
