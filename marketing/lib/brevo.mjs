// Thin Brevo wrapper for contact/list/attribute management (marketing scripts).
const API_URL = 'https://api.brevo.com/v3';

const apiKey = () => {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY is not set');
  return key;
};

const request = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'api-key': apiKey(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Brevo ${method} ${path} -> ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json().catch(() => null);
};

// Custom attributes must exist before POST /contacts will persist them —
// unrecognized attribute keys are silently dropped, not rejected.
export const ensureAttribute = async (name, type) => {
  const { attributes = [] } = (await request('/contacts/attributes')) || {};
  if (attributes.some(a => a.name === name && a.category === 'normal')) return;
  await request(`/contacts/attributes/normal/${name}`, { method: 'POST', body: { type } });
};

export const ensureFolder = async (name) => {
  const { folders = [] } = (await request('/contacts/folders?limit=50')) || {};
  const existing = folders.find(f => f.name === name);
  if (existing) return existing.id;
  const created = await request('/contacts/folders', { method: 'POST', body: { name } });
  return created.id;
};

export const ensureList = async (name, folderId) => {
  const { lists = [] } = (await request('/contacts/lists?limit=50')) || {};
  const existing = lists.find(l => l.name === name);
  if (existing) return existing.id;
  const created = await request('/contacts/lists', { method: 'POST', body: { name, folderId } });
  return created.id;
};

export const upsertContact = ({ email, attributes, listIds }) =>
  request('/contacts', { method: 'POST', body: { email, attributes, listIds, updateEnabled: true } });

export const bulkImport = ({ jsonBody, listIds }) =>
  request('/contacts/import', { method: 'POST', body: { jsonBody, listIds, updateExistingContacts: true } });

export const addContactsToList = (listId, emails) =>
  request(`/contacts/lists/${listId}/contacts/add`, { method: 'POST', body: { emails } });
