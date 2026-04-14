// api/linkedin-client.js — JS-native LinkedIn voyager API wrapper
// Cookie auth via LINKEDIN_LI_AT + LINKEDIN_JSESSIONID env vars
// All operations look like the authenticated user's browser session

const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getAuthHeaders() {
  const liAt = process.env.LINKEDIN_LI_AT;
  const jsessionid = process.env.LINKEDIN_JSESSIONID;
  if (!liAt || !jsessionid) {
    throw new Error('LINKEDIN_LI_AT or LINKEDIN_JSESSIONID env var not set. Extract cookies from browser and add to Vercel env.');
  }
  // CRITICAL: csrf-token must be JSESSIONID value WITHOUT surrounding quotes
  const csrfToken = jsessionid.replace(/^"|"$/g, '');
  return {
    'cookie': `li_at=${liAt}; JSESSIONID=${jsessionid}`,
    'csrf-token': csrfToken,
    'x-restli-protocol-version': '2.0.0',
    'accept': 'application/vnd.linkedin.normalized+json+2.1',
    'user-agent': USER_AGENT,
    'content-type': 'application/json; charset=UTF-8',
  };
}

async function voyagerFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${VOYAGER_BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`LinkedIn auth failed (${res.status}) — li_at cookie may have expired. Re-extract and update LINKEDIN_LI_AT env var.`);
  }
  if (res.status === 429) {
    throw new Error('LinkedIn rate limit hit (429). Back off and retry later.');
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`LinkedIn API error ${res.status}: ${text.slice(0, 300)}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

function publicIdFromUrl(url) {
  const m = (url || '').match(/\/in\/([^/?#]+)/);
  return m ? m[1] : null;
}

function generateTrackingId() {
  // LinkedIn expects a base64-encoded 16-byte random tracking ID
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return Buffer.from(bytes).toString('base64');
}

export async function linkedinTestAuth() {
  try {
    const data = await voyagerFetch('/me');
    const mp = data?.miniProfile || data?.profile?.miniProfile || {};
    return {
      authenticated: true,
      profile: {
        firstName: mp.firstName || data?.firstName,
        lastName: mp.lastName || data?.lastName,
        publicIdentifier: mp.publicIdentifier || data?.publicIdentifier,
      },
    };
  } catch (e) {
    return { authenticated: false, error: e.message };
  }
}

export async function linkedinGetProfile(publicIdOrUrl) {
  const publicId = publicIdOrUrl.includes('/') ? publicIdFromUrl(publicIdOrUrl) : publicIdOrUrl;
  if (!publicId) throw new Error('Invalid LinkedIn URL or publicId');
  const data = await voyagerFetch(`/identity/profiles/${publicId}/profileView`);
  const p = data?.profile || {};
  const mp = p.miniProfile || {};
  return {
    firstName: mp.firstName || p.firstName,
    lastName: mp.lastName || p.lastName,
    headline: mp.occupation || p.headline,
    publicIdentifier: mp.publicIdentifier,
    entityUrn: mp.entityUrn || mp.objectUrn,
    industryName: p.industryName,
    locationName: p.locationName,
    summary: p.summary,
  };
}

export async function linkedinSendInvite(profileUrl, message = '') {
  if (message && message.length > 200) {
    throw new Error('LinkedIn invite messages are limited to 200 characters');
  }
  const publicId = publicIdFromUrl(profileUrl);
  if (!publicId) throw new Error('Invalid LinkedIn profile URL');

  // Get profile to extract entityUrn
  const profile = await linkedinGetProfile(publicId);
  const entityUrn = profile.entityUrn;
  if (!entityUrn) throw new Error('Could not extract entityUrn from profile');
  const memberId = entityUrn.split(':').pop();

  const body = {
    trackingId: generateTrackingId(),
    invitations: [],
    excludeInvitations: [],
    invitee: {
      'com.linkedin.voyager.growth.invitation.InviteeProfile': {
        profileId: memberId,
      },
    },
  };
  if (message) body.message = message;

  const result = await voyagerFetch('/growth/normInvitations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return {
    success: true,
    profileName: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
    invitationUrn: result?.value?.entityUrn || null,
  };
}

export async function linkedinSendMessage(profileUrlOrConversationUrn, messageText) {
  if (!messageText) throw new Error('Message text is required');

  // If it's a profile URL, we need to find/create a conversation
  if (profileUrlOrConversationUrn.includes('/in/')) {
    const publicId = publicIdFromUrl(profileUrlOrConversationUrn);
    const profile = await linkedinGetProfile(publicId);
    const memberUrn = profile.entityUrn;
    if (!memberUrn) throw new Error('Could not resolve member URN');

    // Create a new conversation with this member
    const body = {
      keyVersion: 'LEGACY_INBOX',
      conversationCreate: {
        eventCreate: {
          value: {
            'com.linkedin.voyager.messaging.create.MessageCreate': {
              attributedBody: { text: messageText, attributes: [] },
              attachments: [],
            },
          },
        },
        recipients: [memberUrn],
        subtype: 'MEMBER_TO_MEMBER',
      },
    };

    const result = await voyagerFetch('/messaging/conversations?action=create', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return {
      success: true,
      profileName: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
      conversationUrn: result?.value?.entityUrn || null,
    };
  }

  // It's a conversation URN — send directly
  const body = {
    eventCreate: {
      value: {
        'com.linkedin.voyager.messaging.create.MessageCreate': {
          attributedBody: { text: messageText, attributes: [] },
          attachments: [],
        },
      },
    },
  };
  const result = await voyagerFetch(
    `/messaging/conversations/${encodeURIComponent(profileUrlOrConversationUrn)}/events?action=create`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return { success: true, messageUrn: result?.value?.backendEventUrn || null };
}

export async function linkedinSearch(query, { limit = 10 } = {}) {
  const safeLimit = Math.min(Math.max(1, limit), 25);
  const params = new URLSearchParams({
    decorationId: 'com.linkedin.voyager.dash.deco.search.SearchClusterCollection-165',
    count: String(safeLimit),
    q: 'all',
    query: `(keywords:${encodeURIComponent(query)},flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:resultType,value:List(PEOPLE))))`,
    start: '0',
    origin: 'GLOBAL_SEARCH_HEADER',
  });
  const data = await voyagerFetch(`/search/dash/clusters?${params}`);

  const profiles = [];
  for (const inc of (data?.included || [])) {
    if (inc?.template === 'UNIVERSAL' || inc?.$type?.includes('EntityResult')) {
      const title = inc?.title?.text;
      const primary = inc?.primarySubtitle?.text;
      const secondary = inc?.secondarySubtitle?.text;
      const navUrl = inc?.navigationUrl;
      if (title && navUrl) {
        profiles.push({ name: title, headline: primary || '', location: secondary || '', profileUrl: navUrl });
      }
    }
  }
  return profiles.slice(0, safeLimit);
}

export async function linkedinGetConversations({ limit = 20 } = {}) {
  const data = await voyagerFetch(`/messaging/conversations?keyVersion=LEGACY_INBOX&count=${limit}`);
  return (data?.elements || []).map(c => ({
    conversationUrn: c.entityUrn,
    lastActivityAt: c.lastActivityAt,
    participants: (c.participants || []).map(p => p?.['com.linkedin.voyager.messaging.MessagingMember']?.miniProfile?.publicIdentifier).filter(Boolean),
  }));
}
