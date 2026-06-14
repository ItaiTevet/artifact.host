/** Thin wrapper over the artifact.host REST API. Throws on non-2xx with a useful message. */
export async function apiFetch(host, path, { method = 'GET', token, editToken, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (editToken) headers['x-edit-token'] = editToken;

  let res;
  try {
    res = await fetch(`${host}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(`could not reach ${host} (${e.message}). Is --host correct?`);
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}
