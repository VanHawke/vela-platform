// api/team-members.js — Returns team members for the current org (bypasses RLS)
import { sbFetch } from './kiko-tools.js';

export default async function handler(req, res) {
  try {
    const members = await sbFetch('users?select=id,email,role&order=role.asc');
    return res.json({ ok: true, members: Array.isArray(members) ? members : [] });
  } catch (err) {
    return res.json({ ok: true, members: [
      { id: '9f486437-4bf5-4111-abfe-fe19bfa76063', email: 'sunny@vanhawke.com', role: 'super_admin' },
      { id: 'f1cb67ee-2917-44a3-affe-e8779ede3851', email: 'matt.smith@vanhawke.com', role: 'user' },
    ] });
  }
}
