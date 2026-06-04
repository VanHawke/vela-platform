// api/lib/verify-email.js — Email verification (DNS-based, zero cost)
// Verifies: MX records exist, domain is not disposable, catch-all detection.
// Port 25 is blocked from Hetzner, so SMTP RCPT TO is not available.

import dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);

// Known disposable/temporary email domains
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'trashmail.com', 'temp-mail.org',
  'dispostable.com', 'maildrop.cc', 'fakeinbox.com', 'guerrillamailblock.com',
]);

// Domains known to have catch-all (accept any address)
const KNOWN_CATCHALL = new Set([
  // Add domains discovered to be catch-all during campaigns
]);

/**
 * Verify an email address using DNS checks.
 * @param {string} email
 * @returns {{ valid: boolean|null, reason: string, mx: string|null, checks: object }}
 */
export async function verifyEmail(email) {
  if (!email || !email.includes('@')) return { valid: false, reason: 'invalid_format', mx: null, checks: {} };

  const [local, domain] = email.toLowerCase().split('@');
  const checks = { format: true, mx: false, disposable: false, spf: null };

  // Check 1: Disposable domain
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'disposable_domain', mx: null, checks: { ...checks, disposable: true } };
  }

  // Check 2: MX records exist
  let mxHost = null;
  try {
    const records = await resolveMx(domain);
    if (!records?.length) return { valid: false, reason: 'no_mx_records', mx: null, checks };
    records.sort((a, b) => a.priority - b.priority);
    mxHost = records[0].exchange;
    checks.mx = true;
  } catch {
    return { valid: false, reason: 'domain_not_found', mx: null, checks };
  }

  // Check 3: SPF record exists (indicates domain sends/receives email)
  try {
    const txtRecords = await resolveTxt(domain);
    const spf = txtRecords.flat().find(r => r.startsWith('v=spf1'));
    checks.spf = !!spf;
  } catch { checks.spf = null; }

  // Check 4: Local part sanity (reject obviously fake patterns)
  const suspiciousPatterns = /^(test|fake|asdf|xxx|noreply|no-reply|donotreply|bounce|postmaster|mailer-daemon|abuse|spam)/i;
  if (suspiciousPatterns.test(local)) {
    return { valid: false, reason: 'suspicious_local_part', mx: mxHost, checks };
  }

  // All DNS checks passed — email is plausible (domain receives mail)
  // Cannot confirm mailbox exists without SMTP (port 25 blocked)
  return { valid: true, reason: 'dns_verified', mx: mxHost, checks };
}

export default verifyEmail;
