// api/linkedin-diagnostic.js — Deep network diagnostic for LinkedIn voyager access
// Runs 4 parallel probes to isolate WHERE the failure is:
//   1. DNS resolution of www.linkedin.com
//   2. TLS handshake via node:tls (raw socket)
//   3. HTTPS request via node:https (parallel to undici)
//   4. HTTPS request via undici fetch (current failing path)
// Returns a JSON blob with the full diagnostic tree — use this to pinpoint exactly
// what's failing between Vercel edge and LinkedIn's infrastructure.

import dns from 'dns/promises';
import tls from 'tls';
import https from 'https';

export const config = { maxDuration: 60 };

async function probeDNS() {
  try {
    const addresses = await dns.resolve4('www.linkedin.com');
    return { ok: true, addresses };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code };
  }
}

async function probeTLS() {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve({ ...result, duration_ms: Date.now() - start }); } };
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout after 8s' }), 8000);
    try {
      const socket = tls.connect({
        host: 'www.linkedin.com',
        port: 443,
        servername: 'www.linkedin.com',
        rejectUnauthorized: true,
      });
      socket.once('secureConnect', () => {
        clearTimeout(timer);
        const authorized = socket.authorized;
        const cipher = socket.getCipher();
        const protocol = socket.getProtocol();
        const cert = socket.getPeerCertificate();
        socket.end();
        finish({
          ok: true,
          authorized,
          protocol,
          cipher: cipher?.name,
          peer_subject: cert?.subject?.CN,
          peer_issuer: cert?.issuer?.CN,
        });
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        finish({ ok: false, error: err.message, code: err.code, errno: err.errno, syscall: err.syscall });
      });
    } catch (err) {
      clearTimeout(timer);
      finish({ ok: false, error: err.message, code: err.code });
    }
  });
}

async function probeHttpsNative() {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve({ ...result, duration_ms: Date.now() - start }); } };
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout after 8s' }), 8000);

    const liAt = process.env.LINKEDIN_LI_AT;
    const jsessionid = process.env.LINKEDIN_JSESSIONID;
    if (!liAt || !jsessionid) {
      clearTimeout(timer);
      return finish({ ok: false, error: 'cookies missing from env' });
    }
    const csrfToken = jsessionid.replace(/^"|"$/g, '');

    const req = https.request({
      host: 'www.linkedin.com',
      port: 443,
      path: '/voyager/api/me',
      method: 'GET',
      headers: {
        'cookie': `li_at=${liAt}; JSESSIONID=${jsessionid}`,
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'connection': 'close',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        const body = Buffer.concat(chunks).toString('utf8');
        // Capture ALL response headers so we can see exactly what LinkedIn is returning
        const allHeaders = { ...res.headers };
        // Special handling for set-cookie which is an array
        const setCookie = res.headers['set-cookie'] || [];
        finish({
          ok: true,
          status: res.statusCode,
          location: res.headers['location'] || null,
          set_cookie_count: setCookie.length,
          set_cookie_names: setCookie.map(c => c.split('=')[0]),
          set_cookie_raw: setCookie.map(c => c.slice(0, 200)),
          x_li_fabric: res.headers['x-li-fabric'] || null,
          x_li_proto_ver: res.headers['x-li-proto-ver'] || null,
          x_li_uuid: res.headers['x-li-uuid'] || null,
          all_header_keys: Object.keys(allHeaders),
          content_type: res.headers['content-type'],
          body_preview: body.slice(0, 500),
        });
      });
      res.on('error', (err) => {
        clearTimeout(timer);
        finish({ ok: false, error: err.message, code: err.code });
      });
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      finish({
        ok: false,
        error: err.message,
        code: err.code,
        errno: err.errno,
        syscall: err.syscall,
      });
    });
    req.end();
  });
}

async function probeUndiciFetch() {
  const start = Date.now();
  try {
    const liAt = process.env.LINKEDIN_LI_AT;
    const jsessionid = process.env.LINKEDIN_JSESSIONID;
    if (!liAt || !jsessionid) {
      return { ok: false, error: 'cookies missing from env', duration_ms: Date.now() - start };
    }
    const csrfToken = jsessionid.replace(/^"|"$/g, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const r = await fetch('https://www.linkedin.com/voyager/api/me', {
        signal: controller.signal,
        headers: {
          'cookie': `li_at=${liAt}; JSESSIONID=${jsessionid}`,
          'csrf-token': csrfToken,
          'x-restli-protocol-version': '2.0.0',
          'accept': 'application/vnd.linkedin.normalized+json+2.1',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'connection': 'close',
        },
      });
      clearTimeout(timer);
      const text = await r.text();
      return { ok: true, status: r.status, body_preview: text.slice(0, 200), duration_ms: Date.now() - start };
    } catch (err) {
      clearTimeout(timer);
      return {
        ok: false,
        error: err.message,
        name: err.name,
        code: err.code || null,
        cause_message: err.cause?.message || null,
        cause_code: err.cause?.code || null,
        cause_errno: err.cause?.errno || null,
        cause_syscall: err.cause?.syscall || null,
        cause_name: err.cause?.name || null,
        cause_keys: err.cause ? Object.keys(err.cause) : [],
        duration_ms: Date.now() - start,
      };
    }
  } catch (err) {
    return { ok: false, error: err.message, duration_ms: Date.now() - start };
  }
}

export default async function handler(req, res) {
  const providedKey = req.query?.key || req.headers?.['x-test-key'];
  if (process.env.KIKO_CRON_SECRET && providedKey !== process.env.KIKO_CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const [dnsResult, tlsResult, httpsResult, fetchResult] = await Promise.all([
    probeDNS(),
    probeTLS(),
    probeHttpsNative(),
    probeUndiciFetch(),
  ]);
  return res.status(200).json({
    timestamp: new Date().toISOString(),
    vercel_region: process.env.VERCEL_REGION || 'unknown',
    node_version: process.version,
    probes: {
      dns: dnsResult,
      tls: tlsResult,
      https_native: httpsResult,
      undici_fetch: fetchResult,
    },
  });
}
