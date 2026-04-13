# How to Invite Matt to Vela Platform

## Prerequisites
- Matt has a Google account (Gmail or Google Workspace)
- You know Matt's email address
- You are logged in as super_admin (Sunny)

## Steps

### 1. Navigate to Settings → Team
Open https://vela-platform-one.vercel.app/settings and click the **Team** tab.

### 2. Add Matt's email
In the "Add User" section at the top:
- Enter Matt's email address in the text field
- Select role from the dropdown:
  - **User** — read/write CRM, no export, no admin access, no Org Bible edit
  - **Admin** — full data access + export, cannot edit Org Bible
  - **Super Admin** — full control including Org Bible editing (recommend: do NOT give this to Matt initially)

**Recommended role for Matt: `admin`** (full CRM access + export, but cannot modify Kiko's Org Doctrine).

### 3. Click "Add"
This pre-provisions Matt in `kiko_user_config` with the selected role. When Matt logs in via Google OAuth, the system recognises his email and assigns the correct role.

### 4. Also add Matt to organization_members
Currently the Team tab provisions via `kiko_user_config` (legacy pattern). You should ALSO run this SQL in Supabase to add Matt to the new `organization_members` table:

```sql
-- Replace matt@example.com with Matt's actual email
-- First, find Matt's auth.users UUID after he logs in for the first time:
SELECT id, email FROM auth.users WHERE email = 'matt@example.com';

-- Then add him to the org:
INSERT INTO organization_members (organization_id, user_id, role)
VALUES ('2c6b30da-2d1a-45e5-bbeb-dee1671deba3', '<matt-user-id>', 'admin');
```

### 5. Tell Matt to log in
Matt goes to https://vela-platform-one.vercel.app and clicks "Continue with Google". His Google account must match the email you entered.

### 6. Matt sees onboarding
On first login, Matt gets a 3-step onboarding modal:
1. "Welcome to Van Hawke" — platform intro
2. "Private chats, shared CRM" — data boundaries explained
3. "Meet Kiko" — how to interact with Kiko

### 7. Matt arrives at home page
After onboarding, Matt sees:
- ✅ Shared CRM: pipeline, contacts, organisations, campaigns, partnership matrix
- ✅ His own private Kiko chat (blank — no history from Sunny)
- ✅ His own blank Personal Bible (editable in Settings → Profile)
- ✅ Access to the Organisation Doctrine (read-only unless you give him super_admin)
- ❌ No access to Sunny's chat history or personal memory
- ❌ No export buttons (if role='user') — visible if role='admin'

### 8. Matt connects Gmail (optional, for campaigns)
For Matt to be selected as a "Send from" address in campaigns:
- Matt goes to Settings → Accounts → Connect Google
- Completes OAuth flow
- His Gmail tokens are stored in `user_tokens`
- He now appears in the "Send from" dropdown in the campaign builder

## Troubleshooting

**Matt doesn't receive an email invitation:**
The current system pre-provisions Matt's config — there's no email invite. Matt just goes to the URL and logs in with Google. Tell him the URL directly.

**Matt logs in but sees no data:**
- Check `kiko_user_config` has a row with Matt's email and `active=true`
- Check Matt's `org_id` in auth.users `app_metadata` matches the legacy org_id (`35975d96-c2c9-4b6c-b4d4-bb947ae817d5`)
- If missing, update via Supabase dashboard: `auth.users` → Matt → app_metadata → add `"org_id": "35975d96-c2c9-4b6c-b4d4-bb947ae817d5"`

**Matt's role is wrong:**
Go to Settings → Team, find Matt, change role via dropdown (super_admin only).

**Matt can see Sunny's Kiko chats:**
This should NOT happen. Conversations are RLS-locked to `user_id = auth.uid()`. If it does happen, check that the org_id policies on `conversations` were dropped in Sub-Phase B (they were — section A0p confirms).

## Verification queries (run in Supabase SQL editor)

```sql
-- Check Matt exists in kiko_user_config
SELECT email, role, active FROM kiko_user_config WHERE email = 'matt@example.com';

-- Check Matt exists in organization_members
SELECT om.role, o.name FROM organization_members om
JOIN organizations o ON o.id = om.organization_id
WHERE om.user_id = (SELECT id FROM auth.users WHERE email = 'matt@example.com');

-- Check Matt has NO personal context (should be empty)
SELECT count(*) FROM kiko_personal_context WHERE user_id = (SELECT id FROM auth.users WHERE email = 'matt@example.com');

-- Check Matt has NO conversations (should be 0)
SELECT count(*) FROM conversations WHERE user_id = (SELECT id FROM auth.users WHERE email = 'matt@example.com');
```
