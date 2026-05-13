# Document Operations — Kiko Capability Spec v2.0

| | |
|---|---|
| **Status** | Active Build |
| **Created** | 13 May 2026 |
| **Owner** | Sunny |
| **Codename** | `docops` |

---

## Overview

Document Operations gives Kiko the ability to generate, store, manage, and version documents directly from platform data. Every deal, contact, and campaign can have documents attached — and Kiko can generate them on command using templates + CRM data.

---

## Core Capabilities

### 1. Document Generation from CRM Data
**"Kiko, create a pitch deck for the Haas F1 deal"**

- Kiko pulls deal data (company, contacts, value, stage, notes)
- Selects the appropriate template (pitch deck, proposal, NDA)
- Fills template fields with CRM data
- Generates a downloadable file (PDF or PPTX)
- Attaches the generated document to the deal record

**Data sources for generation:**
- `kiko_deals` — deal name, value, stage, company, contacts
- `kiko_contacts` — name, title, email, company, LinkedIn
- `kiko_companies` — name, industry, size, website
- `kiko_sequences` / `kiko_outreach_queue` — campaign context
- Custom fields provided by the user at generation time

### 2. Document Templates
**Pre-built templates with dynamic field placeholders**

| Template | Fields | Output |
|----------|--------|--------|
| Pitch Deck | company, deal_value, partnership_type, category, season | PPTX |
| Partnership Proposal | company, contact, deal_value, deliverables, timeline | PDF |
| NDA | party_a, party_b, effective_date, jurisdiction | PDF |
| Sponsorship Agreement | team, sponsor, category, fee, term, rights | PDF |
| Meeting Brief | contact, company, deal_stage, talking_points, history | PDF |
| Campaign Report | campaign_name, stats, top_prospects, recommendations | PDF |

**Template system:**
- Templates stored in Supabase Storage (`vela-assets/templates/`)
- Each template has a JSON schema defining its fields
- Fields use `{{field_name}}` placeholder syntax
- Templates can be created/edited by users
- Version history on templates

### 3. Document Storage & Attachment
**Every document linked to deals, contacts, or companies**

- Upload documents (drag & drop, file picker)
- Attach to: deals, contacts, companies, campaigns
- Folder structure per entity (e.g., `/deals/haas-f1/contracts/`)
- Inline preview for PDFs and images
- Download links for all file types
- Storage: Supabase Storage bucket `vela-assets/documents/`

### 4. Version History
**Track every version of every document**

- Auto-version on re-generation or edit
- Version list with timestamps, generator (user or Kiko), and diff summary
- Restore previous versions
- Compare versions side-by-side (future phase)

---

## Database Schema

### `kiko_documents`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Document name |
| description | text | Optional description |
| doc_type | text | pitch_deck, proposal, nda, agreement, brief, report, other |
| template_id | uuid | FK to kiko_doc_templates (if generated) |
| entity_type | text | deal, contact, company, campaign |
| entity_id | text | ID of the linked entity |
| storage_path | text | Path in Supabase Storage |
| file_url | text | Public URL |
| file_size | integer | Size in bytes |
| mime_type | text | application/pdf, etc. |
| generated_by | text | user, kiko |
| generated_data | jsonb | The data used to fill the template |
| version | integer | Version number (1, 2, 3...) |
| parent_id | uuid | Previous version's document ID |
| created_by | uuid | User who created/requested |
| created_at | timestamptz | Timestamp |
| tags | text[] | Searchable tags |

### `kiko_doc_templates`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Template name |
| doc_type | text | pitch_deck, proposal, nda, etc. |
| description | text | What this template is for |
| storage_path | text | Template file in Supabase Storage |
| field_schema | jsonb | Array of field definitions |
| output_format | text | pdf, pptx, docx |
| created_by | uuid | Creator |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| version | integer | Template version |

---

## Build Phases

### Phase 1: Foundation (3 days)
- Database tables (`kiko_documents`, `kiko_doc_templates`)
- Document storage API (upload, list, download, delete)
- Attach documents to deals/contacts/companies
- Documents tab on deal detail page
- Upload via drag & drop

### Phase 2: Template Engine (3 days)
- Template CRUD API
- Field schema definition (name, type, required, default)
- Template file upload to Supabase Storage
- PDF generation from template + data (using html-pdf or Puppeteer)
- PPTX generation (using pptxgenjs)

### Phase 3: Kiko AI Generation (3 days)
- New Kiko tool: `generate_document`
- Tool pulls entity data from CRM automatically
- Selects appropriate template based on request
- Fills fields and generates file
- Attaches to entity and notifies user
- "Kiko, create a pitch deck for the Haas F1 deal" → works

### Phase 4: Version History (2 days)
- Version tracking on document updates
- Version list UI with timestamps and generators
- Restore previous versions
- Auto-version on regeneration

### Phase 5: Documents Page (2 days)
- Dedicated /documents page (or under Command Centre)
- All documents across all entities
- Filter by type, entity, date, tags
- Search documents
- Bulk actions (download, delete)

---

## Kiko Tool Definition

```
generate_document:
  description: Generate a document from a template using CRM data
  parameters:
    - template_type: pitch_deck | proposal | nda | agreement | brief | report
    - entity_type: deal | contact | company
    - entity_id: string (deal ID, contact email, company name)
    - additional_fields: object (any extra fields not in CRM)
  returns:
    - document_url: string
    - document_name: string
    - attached_to: string
```

---

## Priority Order
1. Phase 1 (storage + attachment) — immediate value
2. Phase 3 (Kiko generation) — the headline feature
3. Phase 2 (templates) — needed for Phase 3
4. Phase 4 (versioning) — polish
5. Phase 5 (documents page) — discoverability
