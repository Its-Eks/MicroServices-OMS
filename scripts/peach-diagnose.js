'use strict';

// Quick Peach credential/channel diagnostic
// Usage:
//   node scripts/peach-diagnose.js
// Reads env vars and attempts minimal checkouts against multiple hosts/auth modes.

const axios = require('axios');

// Define known channels here. You can override via env if needed.
const CHANNELS = {
  copyandpay: {
    label: 'COPYandPAY',
    endpoint: 'https://sandbox-card.peachpayments.com',
    entityId: process.env.PEACH_COPY_ENTITY_ID || '8ac7a4c791248df601912778de7903eb',
    token: process.env.PEACH_COPY_ACCESS_TOKEN || 'OGFjN2E0Yzc5MTI0OGRmNjAxOTEyNzc4YTIyMzAzY2N8SnhERkNxS2hAbU1CTnQ4VXE/IU4=',
    authMode: 'bearer'
  },
  s2s: {
    label: 'S2S',
    endpoint: 'https://test.oppwa.com',
    entityId: process.env.PEACH_S2S_ENTITY_ID || '8ac7a4c791248df601912778ba5503d7',
    token: process.env.PEACH_S2S_ACCESS_TOKEN || 'OGFjN2E0Yzc5MTI0OGRmNjAxOTEyNzc4YTIyMzAzY2N8SnhERkNxS2hAbU1CTnQ4VXE/IU4=',
    authMode: 'bearer'
  },
  links: {
    label: 'Payment Links',
    // OAuth (sandbox) – documented base is sandbox-dashboard.peachpayments.com
    authUrl: 'https://sandbox-dashboard.peachpayments.com/oauth2/token',
    // API base for links (sandbox)
    apiBase: 'https://sandbox-l.ppay.io',
    clientId: process.env.PEACH_LINKS_CLIENT_ID || '',
    clientSecret: process.env.PEACH_LINKS_CLIENT_SECRET || '',
    merchantId: process.env.PEACH_LINKS_MERCHANT_ID || '',
    entityId: process.env.PEACH_LINKS_ENTITY_ID || '',
    // fallback success/cancel
    successUrl: process.env.PEACH_LINKS_SUCCESS_URL || 'http://localhost:5173/payment/success',
    cancelUrl: process.env.PEACH_LINKS_CANCEL_URL || 'http://localhost:5173/payment/cancelled'
  }
};

function sanitize(value) {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
}

function env(name, fallback) {
  const v = process.env[name];
  return sanitize(v !== undefined ? v : fallback);
}

async function tryCreate({ label, endpoint, entityId, token, authMode }) {
  const url = `${endpoint.replace(/\/+$/,'')}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
  const headers = { 'Content-Type': 'application/json' };
  if (authMode === 'bearer') headers.Authorization = `Bearer ${token}`;
  if (authMode === 'basic') {
    const b64 = Buffer.from(`${entityId}:${token}`).toString('base64');
    headers.Authorization = `Basic ${b64}`;
  }
  const body = {
    amount: '1.00',
    currency: 'ZAR',
    paymentType: 'DB',
    merchantTransactionId: `diag_${Date.now()}`,
    successUrl: 'https://example.com/success?ref={reference}',
    cancelUrl: 'https://example.com/cancel?ref={reference}'
  };
  const startedAt = Date.now();
  try {
    const resp = await axios.post(url, body, { headers, timeout: 15000, validateStatus: () => true });
    const ms = Date.now() - startedAt;
    const ref = resp.data?.reference || resp.data?.id || resp.data?.checkoutId || resp.data?.ndc;
    const code = resp.data?.result?.code || resp.data?.result;
    return { ok: resp.status < 400 && !!ref, status: resp.status, code, ref, ms, data: resp.data };
  } catch (err) {
    return { ok: false, error: err.message, status: err?.response?.status, data: err?.response?.data };
  }
}

async function createCheckout({ label, endpoint, entityId, token, authMode, requestBody }) {
  const url = `${endpoint.replace(/\/+$/,'')}/v1/checkouts?entityId=${encodeURIComponent(entityId)}`;
  const headers = { 'Content-Type': 'application/json' };
  if (authMode === 'bearer') headers.Authorization = `Bearer ${token}`;
  if (authMode === 'basic') {
    const b64 = Buffer.from(`${entityId}:${token}`).toString('base64');
    headers.Authorization = `Basic ${b64}`;
  }

  const price = Number(requestBody?.servicePackage?.price || 0);
  const install = Number(requestBody?.servicePackage?.installationFee || 0);
  const amountZar = (price + install).toFixed(2);

  const body = {
    amount: amountZar,
    currency: 'ZAR',
    paymentType: 'DB',
    merchantTransactionId: requestBody?.orderId || `diag_${Date.now()}`,
    customer: {
      email: requestBody?.customerEmail,
      givenName: requestBody?.customerName
    },
    billing: {
      street1: requestBody?.serviceAddress?.street,
      city: requestBody?.serviceAddress?.city,
      state: requestBody?.serviceAddress?.province,
      postcode: requestBody?.serviceAddress?.postalCode,
      country: 'ZA'
    },
    successUrl: 'http://localhost:5173/payment/success?ref={reference}',
    cancelUrl: 'http://localhost:5173/payment/cancelled?ref={reference}'
  };

  console.log(`\n▶ ${label}`);
  try {
    const resp = await axios.post(url, body, { headers, timeout: 20000, validateStatus: () => true });
    const ref = resp.data?.reference || resp.data?.id || resp.data?.checkoutId;
    const code = resp.data?.result?.code || resp.data?.result;
    console.log(`  status=${resp.status} code=${code || 'n/a'}`);
    if (resp.status < 400 && ref) {
      const hostedUrl = `${endpoint.replace(/\/+$/,'')}/v1/checkouts/${encodeURIComponent(ref)}/payment?entityId=${encodeURIComponent(entityId)}`;
      console.log('  ✅ Created checkout');
      console.log(`  reference=${ref}`);
      console.log(`  hostedUrl=${hostedUrl}`);
    } else {
      console.log('  ❌ Failed to create');
      console.log(typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)?.substring(0, 600));
    }
  } catch (e) {
    console.log('  ❌ Request error');
    console.log(e?.message || e);
    if (e?.response) {
      console.log(`  status=${e.response.status}`);
      console.log(typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data)?.substring(0, 600));
    }
  }
}

async function createPaymentLink({ label, authUrl, apiBase, clientId, clientSecret, merchantId, entityId, requestBody, successUrl, cancelUrl }) {
  console.log(`\n▶ ${label}`);
  // 1) OAuth token
  const tokenBodies = [
    new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
    new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'payment_links:create' }).toString()
  ];
  let accessToken;
  const authCandidates = (() => {
    try {
      const u = new URL(authUrl);
      const paths = [u.pathname, '/oauth2/token', '/oauth/token'];
      const uniq = Array.from(new Set(paths.filter(Boolean)));
      return uniq.map(p => `${u.origin}${p}`);
    } catch {
      return [authUrl, 'https://sandbox-dashboard.peachpayments.com/oauth2/token', 'https://sandbox-dashboard.peachpayments.com/oauth/token'];
    }
  })();
  for (const au of authCandidates) {
    for (const tb of tokenBodies) {
      try {
        const tok = await axios.post(au, tb, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000, validateStatus: () => true });
        if (tok.status < 400 && (tok.data?.access_token || tok.data?.accessToken)) {
          accessToken = tok.data?.access_token || tok.data?.accessToken;
          break;
        } else {
          console.log(`  token FAIL @ ${au} (status=${tok.status}) ${typeof tok.data==='string'?tok.data:JSON.stringify(tok.data)?.substring(0,300)}`);
        }
      } catch (e) {
        console.log(`  token error @ ${au}: ${e?.message || e}`);
      }
    }
    if (accessToken) break;
  }
  if (!accessToken) {
    console.log('  ❌ Could not obtain OAuth token');
    return;
  }

  // 2) Create payment link (try a couple of candidates)
  const price = Number(requestBody?.servicePackage?.price || 0);
  const install = Number(requestBody?.servicePackage?.installationFee || 0);
  const amountZar = (price + install).toFixed(2);
  const common = {
    amount: amountZar,
    currency: 'ZAR',
    description: `Order ${requestBody?.orderId || ''}`.trim(),
    customer: { email: requestBody?.customerEmail, name: requestBody?.customerName },
    successUrl,
    cancelUrl,
    merchantId: merchantId || undefined,
    entityId: entityId || undefined
  };

  const candidates = [
    { method: 'post', url: `${apiBase.replace(/\/+$/,'')}/v1/payment-links`, body: common },
    { method: 'post', url: `${apiBase.replace(/\/+$/,'')}/api/payment_links`, body: common }
  ];
  for (const c of candidates) {
    try {
      const resp = await axios({ method: c.method, url: c.url, data: c.body, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 20000, validateStatus: () => true });
      const status = resp.status;
      const link = resp.data?.url || resp.data?.paymentUrl || resp.data?.link || resp.data?.shortUrl;
      if (status < 400 && link) {
        console.log(`  ✅ Link created (status=${status})`);
        console.log(`  link=${link}`);
        return;
      } else {
        console.log(`  create FAIL @ ${c.url} (status=${status}) ${typeof resp.data==='string'?resp.data:JSON.stringify(resp.data)?.substring(0,500)}`);
      }
    } catch (e) {
      console.log(`  create error @ ${c.url}: ${e?.message || e}`);
      if (e?.response) console.log(`  details: ${typeof e.response.data==='string'?e.response.data:JSON.stringify(e.response.data)?.substring(0,500)}`);
    }
  }
  console.log('  ❌ Could not create payment link on any known endpoint');
}

async function main() {
  const cases = [];

  // Hosted / COPYandPAY (Bearer)
  const hostedEntity = env('PEACH_HOSTED_ENTITY_ID', '8ac7a4c8912490d60191277918dc0378');
  const hostedToken = env('PEACH_HOSTED_ACCESS_TOKEN', '587f1fd2858946dab6a8670545444bad');
  if (hostedEntity && hostedToken) {
    cases.push({ label: 'Hosted (sandbox-card, Bearer)', endpoint: 'https://sandbox-card.peachpayments.com', entityId: hostedEntity, token: hostedToken, authMode: 'bearer' });
    cases.push({ label: 'Hosted (card, Bearer)', endpoint: 'https://card.peachpayments.com', entityId: hostedEntity, token: hostedToken, authMode: 'bearer' });
  }

  // COPYandPAY explicit pair (if provided)
  const copyEntity = env('PEACH_COPY_ENTITY_ID', '8ac7a4c791248df601912778de7903eb');
  const copyToken = env('PEACH_COPY_ACCESS_TOKEN', 'OGFjN2E0Yzc5MTI0OGRmNjAxOTEyNzc4YTIyMzAzY2N8SnhERkNxS2hAbU1CTnQ4VXE/IU4=');
  if (copyEntity && copyToken) {
    cases.push({ label: 'COPYandPAY (sandbox-card, Bearer)', endpoint: 'https://sandbox-card.peachpayments.com', entityId: copyEntity, token: copyToken, authMode: 'bearer' });
  }

  // Payments API / S2S (often oppwa/testsecure). Try Bearer first, then Basic as fallback signal.
  const s2sEntity = env('PEACH_S2S_ENTITY_ID', '8ac7a4c791248df601912778ba5503d7') || env('PEACH_ENTITY_ID');
  const s2sToken = env('PEACH_S2S_ACCESS_TOKEN', 'OGFjN2E0Yzc5MTI0OGRmNjAxOTEyNzc4YTIyMzAzY2N8SnhERkNxS2hAbU1CTnQ4VXE/IU4=') || env('PEACH_ACCESS_TOKEN');
  if (s2sEntity && s2sToken) {
    ['https://test.oppwa.com', 'https://testsecure.peachpayments.com'].forEach((endpoint) => {
      cases.push({ label: `S2S (Bearer) @ ${endpoint}`, endpoint, entityId: s2sEntity, token: s2sToken, authMode: 'bearer' });
      cases.push({ label: `S2S (Basic) @ ${endpoint}`, endpoint, entityId: s2sEntity, token: s2sToken, authMode: 'basic' });
    });
  }

  if (cases.length === 0) {
    console.error('No credentials found in env or fallbacks.');
    process.exit(1);
  }

  console.log('🔎 Testing Peach credentials across channels...');
  for (const c of cases) {
    console.log(`\n— ${c.label}\n  entityId=${c.entityId}\n  authMode=${c.authMode}`);
    const res = await tryCreate(c);
    if (res.ok) {
      console.log(`  ✅ OK (status=${res.status}, ${res.ms}ms) ref=${res.ref} code=${res.code || 'n/a'}`);
    } else {
      console.log(`  ❌ FAIL (status=${res.status || 'n/a'}) ${res.error || ''}`);
      if (res.data) {
        const msg = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        console.log(`  details: ${msg.substring(0, 300)}`);
      }
    }
  }

  console.log('\nDone. Notes:');
  console.log('- 401 Unauthorized → entityId/token not a valid pair for that host/channel/auth.');
  console.log('- 403 IncompleteSignature/Invalid key=value → wrong host/auth style for that channel.');
  console.log('- Use the row that shows ✅ to configure onboarding-service.');

  // Also exercise onboarding-service create API with provided body
  const createUrl = env('ONBOARDING_CREATE_URL', 'http://localhost:3004/api/payments/create');
  const svcKey = env('ONBOARDING_SERVICE_KEY', 'oms-svc-auth-local');
  const createBody = {
    orderId: 'a3bd52ac-a9cd-416f-962b-91ce4e3a3713',
    customerId: '7308d209-a5be-49a9-8692-26abe87f7c8b',
    customerEmail: 'jesse.mashoana@gmail.com',
    customerName: 'Jesse',
    orderType: 'new_install',
    servicePackage: { name: 'wireless', speed: '100/20', price: 599, installationFee: 999, installationType: 'professional_install' },
    serviceAddress: { street: '149 Watermeyer St, Meyerspark', city: 'Pretoria', province: 'gauteng', postalCode: '0002' }
  };

  console.log(`\n▶ Calling onboarding-service create: ${createUrl}`);
  try {
    const resp = await axios.post(createUrl, createBody, {
      headers: { 'Content-Type': 'application/json', 'x-service-key': svcKey },
      timeout: 20000,
      validateStatus: () => true
    });
    const data = resp.data;
    const link = data?.hostedUrl || data?.paymentUrl || data?.url;
    const peachRef = data?.peachCheckoutId || data?.peach_checkout_id || data?.reference || data?.id;
    console.log(`  status=${resp.status}`);
    if (link || peachRef) {
      console.log(`  ✅ Created via onboarding-service`);
      if (link) console.log(`  link=${link}`);
      if (peachRef) console.log(`  reference=${peachRef}`);
    } else {
      console.log('  ❌ Unexpected response');
      console.log(typeof data === 'string' ? data : JSON.stringify(data)?.substring(0, 500));
    }
  } catch (e) {
    console.log('  ❌ Request failed');
    console.log(e?.message || e);
    if (e?.response) {
      console.log(`  status=${e.response.status}`);
      console.log(typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data)?.substring(0, 500));
    }
  }

  // Direct Peach create (COPYandPAY)
  const selected = (process.env.DIAG_CHANNEL || '').toLowerCase();
  const toRun = selected && CHANNELS[selected] ? { [selected]: CHANNELS[selected] } : CHANNELS;

  if (toRun.copyandpay) {
    const ch = toRun.copyandpay;
    await createCheckout({
      label: `${ch.label} create (${new URL(ch.endpoint).host})`,
      endpoint: ch.endpoint,
      entityId: ch.entityId,
      token: ch.token,
      authMode: ch.authMode,
      requestBody: createBody
    });
  }

  // Direct Peach create (S2S)
  if (toRun.s2s) {
    const ch = toRun.s2s;
    await createCheckout({
      label: `${ch.label} create (${new URL(ch.endpoint).host})`,
      endpoint: ch.endpoint,
      entityId: ch.entityId,
      token: ch.token,
      authMode: ch.authMode,
      requestBody: createBody
    });
  }

  // Payment Links channel
  if (toRun.links) {
    const ch = toRun.links;
    await createPaymentLink({
      label: `${ch.label} create (${new URL(ch.apiBase).host})`,
      authUrl: ch.authUrl,
      apiBase: ch.apiBase,
      clientId: ch.clientId,
      clientSecret: ch.clientSecret,
      merchantId: ch.merchantId,
      entityId: ch.entityId,
      requestBody: createBody,
      successUrl: ch.successUrl,
      cancelUrl: ch.cancelUrl
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


