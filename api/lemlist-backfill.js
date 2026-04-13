// api/lemlist-backfill.js — One-shot backfill for historical skipped rows
// POST /api/lemlist-backfill?key=<KIKO_CRON_SECRET>
// Scans lemlist_webhook_log for status='skipped' high-value events,
// re-processes them, marks as 'backfilled_<contactId>'.

import { createClient } from "@supabase/supabase-js";
import { sendAlert } from "./alert-utils.js";

export const config = { maxDuration: 60 };

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

const HIGH_VALUE_EVENTS = ["emailsReplied", "emailsInterested", "emailsClicked"];

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

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const providedKey = req.query?.key || req.headers?.["x-backfill-key"];
  if (process.env.KIKO_CRON_SECRET && providedKey !== process.env.KIKO_CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

  const { data: rows, error } = await supabase.from("lemlist_webhook_log")
    .select("id, event_type, email, campaign, status, detail, received_at")
    .eq("status", "skipped").in("event_type", HIGH_VALUE_EVENTS)
    .gte("received_at", "2026-01-01").order("received_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const today = new Date().toISOString().split("T")[0];
  const results = { scanned: rows?.length || 0, processed: 0, errors: 0, alerts_fired: 0, contacts_created: 0 };

  for (const row of (rows || [])) {
    try {
      const { data: existing } = await supabase.from("contacts").select("id").filter("data->>email", "ilike", row.email).limit(1);
      let contactId;
      if (existing?.length) {
        contactId = existing[0].id;
      } else {
        const { firstName, lastName } = nameFromEmail(row.email);
        contactId = "c" + Date.now() + Math.floor(Math.random() * 1000);
        await supabase.from("contacts").upsert([{
          id: contactId,
          org_id: ORG_ID,
          data: {
            id: contactId, firstName, lastName, middleName: "", title: "", email: row.email, phone: "", linkedin: "",
            companyId: "", authority: "Decision Maker", preferredContact: "Email", status: "Active", dnc: false,
            source: "Lemlist (backfilled)", lead_source: "lemlist", lemlist_campaign: row.campaign, timezone: "GMT",
            owner: "Lemlist Webhook (Backfill)",
            notes: `Backfilled from lemlist_webhook_log id=${row.id}, original received_at=${row.received_at}`,
            campaigns: [row.campaign], rightsHolders: [], researchNotes: [], createdAt: today,
            lastActivity: row.received_at?.split("T")[0] || today,
            activities: [{ id: Date.now(), type: "Email", date: row.received_at?.split("T")[0] || today, user: "Lemlist Webhook (Backfill)", note: `[Lemlist BACKFILL] ${row.event_type} — ${row.campaign} — original event ${row.received_at}` }],
          },
          updated_at: new Date().toISOString(),
        }]);
        results.contacts_created++;
      }

      await supabase.from("kiko_alerts").insert([{
        type: "reply_from_prospect_uncrm_match_backfill", severity: "high",
        title: `BACKFILLED: ${row.event_type} from ${row.email}`,
        detail: `Historical Lemlist event from ${row.received_at}. Campaign: ${row.campaign}. Contact ${contactId}. Open Lemlist Inbox to review.`,
        entity_type: "contact", entity_name: row.email, entity_id: contactId,
        metadata: { source: "lemlist_webhook_backfill", original_log_id: row.id, event_type: row.event_type, campaign: row.campaign, original_received_at: row.received_at },
        created_at: new Date().toISOString(),
      }]);
      results.alerts_fired++;

      await supabase.from("lemlist_webhook_log").update({ status: `backfilled_${contactId}` }).eq("id", row.id);
      results.processed++;
    } catch (e) {
      console.error(`[backfill] row ${row.id} failed:`, e.message);
      results.errors++;
    }
  }

  if (results.processed > 0) {
    try {
      await sendAlert(
        `Lemlist webhook backfill complete: ${results.processed} historical events`,
        `Scanned: ${results.scanned}\nProcessed: ${results.processed}\nContacts created: ${results.contacts_created}\nAlerts fired: ${results.alerts_fired}\nErrors: ${results.errors}\n\nReview Kiko Alerts for the full list.`,
        "warning"
      );
    } catch (e) { console.error("[backfill] summary email failed:", e.message); }
  }

  return res.status(200).json({ ok: true, ...results });
}
