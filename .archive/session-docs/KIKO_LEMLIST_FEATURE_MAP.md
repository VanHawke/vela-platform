# KIKO vs LEMLIST — COMPLETE FEATURE MAP
## Built from Lemlist help docs + live app analysis | 6 April 2026

## LEMLIST CAMPAIGN FLOW (4 tabs)
1. **Sequence** — Build steps: Email, LinkedIn, Call, WhatsApp, Task, Condition
2. **Lead list** — Import/view leads, enrich, set timezone, verify deliverability
3. **Launch** — Preview, confirm schedule, stop conditions, final sign-off
4. **Overview** — Live performance metrics after launch

## CONDITION TYPES (branching logic)
| Condition | Yes Branch | No Branch | Kiko Status |
|-----------|-----------|-----------|-------------|
| Has email (deliverable) | Email path | LinkedIn path | ❌ |
| Has LinkedIn URL | LinkedIn steps | Email only | ❌ |
| Email opened | Continue email | Try LinkedIn | ❌ (no open tracking) |
| Email clicked | Specific follow-up | General follow-up | ❌ (no click tracking) |
| Replied | Auto-stops sequence | Continue | ✅ (reply detection exists) |
| Accepted LinkedIn invite | Send LinkedIn message | Fall back to email | ❌ |
| Within X days (time-bound) | If fulfilled in time | If not in time | ❌ |
| Wait Until (pause) | Resumes when met | Stays paused | ❌ |
| Boolean custom variable | Yes path | No path | ❌ |

## LINKEDIN STEPS
| Step | Description | Kiko Status |
|------|-------------|-------------|
| Profile Visit | Warm-up — visit their profile | ❌ (queue exists, no executor) |
| Connection Invite | Send invite with note | ❌ |
| Chat Message | Message 1st connections | ❌ |
| Voice Message | Audio message | ❌ |

## STEP TYPES
- Email (with AI generation, templates, variables)
- LinkedIn (visit, invite, message, voice)
- Call (with dialer integration)
- WhatsApp message
- Manual Task (mark as done to progress)
- Condition (branching node)
- Wait/Delay (min 1 day between steps)

## OTHER KEY FEATURES
| Feature | Description | Kiko Status |
|---------|-------------|-------------|
| 100+ templates | Pre-built sequence templates | ❌ (AI generates fresh) |
| Campaign duplication | Copy existing campaign | ❌ |
| A/B testing | Test subject lines/body variants | ❌ |
| Dynamic Senders | Match sender to lead owner | ❌ (single sender) |
| Same-thread follow-ups | Blank subject for threading | ✅ (thread ID tracking) |
| Pause on company engage | Stop all leads at company on reply | ❌ (only stops individual) |
| Lead enrichment | Find email, phone, data | Partial (company enrichment) |
| Email deliverability | Per-lead deliverability score | ❌ |
| Timezone per lead | Select local time for sending | ✅ (just built — auto-detect) |
| Lead scoring | Score leads on engagement | ❌ |
| AI Columns | Auto-generate custom data columns | ❌ |
| Phone finder | Find phone numbers | ❌ |
| Chrome extension | Import from LinkedIn | ❌ |
| Unified inbox | All replies in one place | ❌ |
| Drag-drop reorder | Reorder steps in sequence | ❌ |
| Manual task steps | Mark done to progress | ❌ |
| Edit active campaign | Limited editing while live | ❌ |
| People database (450M) | Built-in lead finder | ❌ |

## WHAT TO BUILD NEXT (PRIORITY ORDER)

### Session 1: Conditional Branching Data Model + UI
**Data model change** — add `condition` step type to sequences:
```json
{
  "step": 4,
  "type": "condition",
  "condition_type": "no_reply",
  "condition_params": { "after_step": 3, "within_days": 3 },
  "yes_branch": [{ "step": 4.1, "channel": "email", ... }],
  "no_branch": [{ "step": 4.2, "channel": "linkedin", "action": "invite", ... }]
}
```
**Condition types to support (Phase 1):**
- `no_reply` — lead hasn't replied after N days (uses existing reply detection)
- `has_linkedin` — lead has LinkedIn URL in CRM data
- `has_email` — lead has verified email

**UI changes:**
- Add "Condition" as a step type option (alongside Email and LinkedIn)
- When condition step selected, show Yes/No branching in the visual flow
- Each branch can have its own sub-steps

**Cron changes:**
- cron-sequence-enqueue.js: When evaluating a condition step, check the condition and route to yes_branch or no_branch
- Track which branch each enrollment took

### Session 2: LinkedIn Execution
**PhantomBuster integration** (or equivalent):
- Profile visit automation
- Connection request with personalised note
- Message to 1st-degree connections
- Track acceptance status (for "accepted invite" condition)

**Alternative: Manual LinkedIn queue with Kiko alerts**
- Kiko queues LinkedIn actions (already has linkedin_queue table)
- Sends you an alert: "Send LinkedIn invite to [Name] with this note: ..."
- You mark as done → enrollment progresses
- This works WITHOUT any third-party integration

### Session 3: Open Tracking + Click Tracking
**Email open tracking:**
- Add invisible tracking pixel to HTML emails
- New API endpoint to receive pixel hits
- Store open events in kiko_lead_activity
- Enable "email opened" condition type

**Click tracking:**
- Wrap links in emails with tracking redirect
- New API endpoint to handle redirect + log click
- Store click events
- Enable "clicked link" condition type

### Session 4: Polish + Missing Features
- Campaign duplication
- A/B subject line testing
- Drag-drop step reorder
- Lead scoring (engagement-based)
- Unified inbox for replies
- Pause all leads at company on reply

## RECOMMENDED MULTICHANNEL TEMPLATE
Based on Lemlist's proven pattern:
```
Day 0: Email #1 (authority hook)
Day 3: Email #2 (deeper context)
Day 5: CONDITION — email opened?
  → YES: Day 7: Email #3 (social proof)
  → NO: Day 7: LinkedIn invite (with personalised note)
Day 10: CONDITION — LinkedIn invite accepted?
  → YES: Day 11: LinkedIn message
  → NO: Day 12: Email #3 (different angle)
Day 14: Email #4 (strategic withdrawal / final)
```

This is the exact pattern Lemlist recommends. Kiko can generate this automatically.
