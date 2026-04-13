// api/lemlist-webhook.js — Lemlist Event Receiver with Safety Net (v0.0.63)
// Replaces the legacy handler at vanhawke-crm.vercel.app/api/lemlist-webhook
//
// Behavior:
//  - Mirrors legacy handler for contactAdded, activity logging, bounce/unsub
//  - NEW: For high-value events (emailsReplied, emailsInterested, emailsClicked)
//    on no-CRM-match, auto-creates a contact AND fires a high-priority alert
//    AND emails Sunny. Status becomes 'processed_no_match' instead of 'skipped'.
//  - Backward compatible with existing lemlist_webhook_log schema
//  - Preserves exact contact/company JSONB shapes used by the CRM UI

import { createClient } from "@supabase/supabase-js";
import { sendAlert } from "./alert-utils.js";

export const config = { maxDuration: 30 };

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const HIGH_VALUE_EVENTS = new Set(["emailsReplied", "emailsInterested", "emailsClicked"]);

const EVENT_LABELS = {
  emailsSent: "Email Sent",
  emailsOpened: "Email Opened",
  emailsClicked: "Link Clicked",
  emailsReplied: "Reply Received",
  emailsBounced: "Email Bounced",
  emailsUnsubscribed: "Unsubscribed",
  emailsFailed: "Email Failed",
  emailsInterested: "Interested",
  emailsNotInterested: "Not Interested",
  contactAdded: "Contact Added",
};

function domainOf(email) {
  const parts = (email || "").split("@");
  return parts[1] ? parts[1].toLowerCase() : "";
}

function nameFromEmail(email) {
  const local = (email || "").split("@")[0] || "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return { firstName: "Unknown", lastName: "Lead" };
  const parts = cleaned.split(/\s+/);
  return {
    firstName: (parts[0] || "Unknown").charAt(0).toUpperCase() + (parts[0] || "").slice(1),
    lastName: parts.slice(1).join(" ").replace(/^./, c => c.toUpperCase()) || "(from email)",
  };
}

async function logWebhook(eventType, email, campaignName, status, detail) {
  if (!supabase) return;
  try {
    await supabase.from("lemlist_webhook_log").insert([{
      event_type: eventType, email: email || "", campaign: campaignName || "",
      status, detail: typeof detail === "string" ? detail : JSON.stringify(detail || {}),
      received_at: new Date().toISOString(),
    }]);
  } catch (e) { console.error("[lemlist-webhook] log failed:", e.message); }
}

async function fireKikoAlert({ eventType, email, campaignName, contactId, contactName, payload }) {
  const label = EVENT_LABELS[eventType] || eventType;
  const title = `Reply: ${contactName || email}`;
  const detail = `${label} from ${contactName || email} via Lemlist campaign "${campaignName}". Auto-created CRM contact (id: ${contactId}). Open Lemlist Inbox to respond.`;

  try {
    await supabase.from("kiko_alerts").insert([{
      type: "reply_from_prospect_uncrm_match", severity: "high",
      title, detail, entity_type: "contact", entity_name: contactName || email,
      entity_id: contactId || null,
      metadata: { source: "lemlist_webhook_safety_net", event_type: eventType, campaign: campaignName, email, raw_payload: payload || null },
      created_at: new Date().toISOString(),
    }]);
  } catch (e) { console.error("[lemlist-webhook] kiko_alerts insert failed:", e.message); }

  try {
    const alertTitle = `🚨 LEMLIST ${label.toUpperCase()} — ${contactName || email}`;
    const alertBody = `Event: ${label}\nFrom: ${contactName || "(no name)"} <${email}>\nCampaign: ${campaignName}\nTime: ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })}\n\nContact auto-created in Kiko CRM (id: ${contactId || "n/a"}).\nAction required: open Lemlist Inbox and respond within 4 hours.\n\nhttps://app.lemlist.com/teams/tea_LvmzA4g3NKy6awoRm/inbox/list/myConversations`;
    await sendAlert(alertTitle, alertBody, "warning");
  } catch (e) { console.error("[lemlist-webhook] sendAlert failed:", e.message); }
}

async function findOrCreateCompany({ domain, companyName }) {
  if (!supabase || (!domain && !companyName)) return "";
  const { data: rows, error } = await supabase.from("companies").select("id, data").limit(5000);
  if (error) throw error;
  let matched = null;
  if (domain) matched = (rows || []).find(r => r.data?.website && r.data.website.toLowerCase().includes(domain));
  if (!matched && companyName) matched = (rows || []).find(r => r.data?.name && r.data.name.toLowerCase() === companyName.toLowerCase());
  if (matched) return matched.data?.id || matched.id;

  const today = new Date().toISOString().split("T")[0];
  const newOrgId = "org" + Date.now() + Math.floor(Math.random() * 1000);
  await supabase.from("companies").upsert([{ id: newOrgId, data: { id: newOrgId, name: companyName || domain || "Unknown", website: domain || "", industry: "", hqCountry: "", revenue: "", accountTier: "", notes: "", createdAt: today, researchNotes: [] }, updated_at: new Date().toISOString() }]);
  return newOrgId;
}

async function createContact({ email, firstName, lastName, payload, campaignName, label }) {
  const today = new Date().toISOString().split("T")[0];
  const newContactId = "c" + Date.now() + Math.floor(Math.random() * 1000);
  const domain = domainOf(email);
  const companyName = (payload?.companyName || payload?.company || "").trim();
  let companyId = "";
  try { companyId = await findOrCreateCompany({ domain, companyName }); } catch (e) { console.error("[lemlist-webhook] company lookup failed:", e.message); }

  const newContact = {
    id: newContactId, firstName: firstName || "", lastName: lastName || "", middleName: "",
    title: (payload?.jobTitle || payload?.title || "").trim(), email, phone: (payload?.phone || "").trim(),
    linkedin: (payload?.linkedinUrl || payload?.linkedin || "").trim(), companyId,
    authority: "Decision Maker", preferredContact: "Email", status: "Active", dnc: false,
    source: "Lemlist", lead_source: "lemlist", lemlist_campaign: campaignName, timezone: "GMT",
    owner: "Lemlist Webhook", notes: "", campaigns: [campaignName], rightsHolders: [], researchNotes: [],
    createdAt: today, lastActivity: today,
    activities: [{ id: Date.now(), type: "Email", date: today, user: "Lemlist Webhook", note: `[Lemlist] ${label} — ${campaignName}` }],
  };
  await supabase.from("contacts").upsert([{ id: newContactId, data: newContact, updated_at: new Date().toISOString() }]);
  return { contactId: newContactId, contactName: `${firstName} ${lastName}`.trim(), companyId };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
    try {
      const { data: logs, error } = await supabase.from("lemlist_webhook_log").select("*").order("received_at", { ascending: false }).limit(30);
      if (error) throw error;
      return res.status(200).json({ logs: logs || [] });
    } catch (e) { return res.status(200).json({ logs: [], error: e.message }); }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

  const payload = req.body;
  if (!payload || !payload.type) { await logWebhook("unknown", "", "", "rejected", "Missing type"); return res.status(400).json({ error: "Invalid payload: missing type" }); }

  const eventType = payload.type;
  const email = (payload.email || payload.leadEmail || "").toLowerCase().trim();
  const campaignName = payload.campaignName || payload.campaign || "Unknown Campaign";
  const label = EVENT_LABELS[eventType] || eventType;
  const today = new Date().toISOString().split("T")[0];

  if (!email) { await logWebhook(eventType, "", campaignName, "rejected", "Missing email"); return res.status(400).json({ error: "Invalid payload: missing email" }); }

  try {
    const { data: matchedContacts, error: fetchErr } = await supabase.from("contacts").select("id, data").filter("data->>email", "ilike", email).limit(1);
    if (fetchErr) throw fetchErr;
    const existing = (matchedContacts || [])[0] || null;

    // ── BRANCH A: Existing contact → append activity ──
    if (existing) {
      const contact = existing.data;
      const activity = { id: Date.now() + Math.random(), type: "Email", date: today, user: "Lemlist Webhook", note: `[Lemlist] ${label} — ${campaignName}` };
      let statusUpdate = null;
      if (eventType === "emailsBounced") statusUpdate = "Bounced";
      if (eventType === "emailsUnsubscribed") statusUpdate = "Unsubscribed";

      const updated = { ...contact, activities: [activity, ...(contact.activities || [])], lastActivity: today, lead_source: contact.lead_source || "lemlist", lemlist_campaign: campaignName };
      if (statusUpdate) updated.status = statusUpdate;
      if (!updated.campaigns?.includes(campaignName)) updated.campaigns = [...(updated.campaigns || []), campaignName];

      const { error: updateErr } = await supabase.from("contacts").update({ data: updated, updated_at: new Date().toISOString() }).eq("id", existing.id);
      if (updateErr) throw updateErr;

      if (HIGH_VALUE_EVENTS.has(eventType)) {
        await fireKikoAlert({ eventType, email, campaignName, contactId: existing.id, contactName: `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || email, payload });
      }

      await logWebhook(eventType, email, campaignName, "updated", statusUpdate ? `Status → ${statusUpdate}` : "Activity added");
      return res.status(200).json({ status: "ok", contact: email, event: label, statusUpdated: statusUpdate || "none" });
    }

    // ── BRANCH B1: contactAdded with name → legacy create ──
    if (eventType === "contactAdded") {
      const firstName = (payload.firstName || payload.first_name || "").trim();
      const lastName = (payload.lastName || payload.last_name || "").trim();
      if (!firstName && !lastName) { await logWebhook(eventType, email, campaignName, "skipped", "No name provided"); return res.status(200).json({ status: "skipped", reason: "No name for new contact" }); }
      const created = await createContact({ email, firstName, lastName, payload, campaignName, label });
      await logWebhook(eventType, email, campaignName, "created", `Contact created: ${firstName} ${lastName}`);
      return res.status(200).json({ status: "created", contact: email, contactId: created.contactId, companyId: created.companyId || null });
    }

    // ── BRANCH B2: HIGH-VALUE no match → SAFETY NET ──
    if (HIGH_VALUE_EVENTS.has(eventType)) {
      let firstName = (payload.firstName || payload.first_name || "").trim();
      let lastName = (payload.lastName || payload.last_name || "").trim();
      if (!firstName && !lastName) { const fb = nameFromEmail(email); firstName = fb.firstName; lastName = fb.lastName; }
      const created = await createContact({ email, firstName, lastName, payload, campaignName, label });
      await fireKikoAlert({ eventType, email, campaignName, contactId: created.contactId, contactName: created.contactName, payload });
      await logWebhook(eventType, email, campaignName, "processed_no_match", `Auto-created contact ${created.contactId} + alert fired for ${label}`);
      return res.status(200).json({ status: "processed_no_match", contact: email, contactId: created.contactId, alertFired: true });
    }

    // ── BRANCH B3: Low-value no match → skip with distinct status ──
    await logWebhook(eventType, email, campaignName, "skipped_low_value", `No CRM contact, low-value event ${label}`);
    return res.status(200).json({ status: "skipped_low_value", reason: "Low-value event from non-CRM contact" });

  } catch (err) {
    console.error("[lemlist-webhook] error:", err);
    await logWebhook(eventType, email, campaignName, "error", err.message);
    return res.status(500).json({ error: err.message });
  }
}
