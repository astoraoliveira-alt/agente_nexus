const https = require('https');

function post(url, data, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = https.request(u, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, (res) => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: buf, headers: res.headers }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  const loginRes = await post('https://apidev.moneymoneyinvest.com.br/business-partners/api/v2/login', {
    email: 'ticket_davos@partner.com',
    password: 'fiwBQPlN452k9u3kVg'
  });
  const token = JSON.parse(loginRes.body).token;
  console.log('Login OK.');

  const tests = [
    {
      name: '1. User Original Body (registration_code has 13 digits)',
      body: {
        "contact_name": "LEAD 5511972323578",
        "contact_phone_number": "11972323578",
        "registration_code": "2122551432290",
        "revenue": 200000,
        "requested_amount": 150000,
        "opt_in": true,
        "opt_in_origin": "whatsapp",
        "opt_in_ip": "200.150.10.20",
        "opt_in_timestamp": "2026-08-11T12:16:47.977Z",
        "opt_in_signer_name": "LEAD 5511972323578",
        "opt_in_phone": "5511972323578",
        "opt_in_message_id": "wamid_optin_1786450608016",
        "opt_in_consent_text_version": "v1-2026-06",
        "opt_in_consent_text_hash": "b919e74d1075bbd1c44fcef663f7e691932d5eb1fe1e54f8b30a3032c2b30d8b",
        "opt_in_confirmation_message": "sim, autorizo"
      }
    },
    {
      name: '2. User Body with 14-digit CNPJ (padded with zero: 02122551432290)',
      body: {
        "contact_name": "LEAD 5511972323578",
        "contact_phone_number": "11972323578",
        "registration_code": "02122551432290",
        "revenue": 200000,
        "requested_amount": 150000,
        "opt_in": true,
        "opt_in_origin": "whatsapp",
        "opt_in_ip": "200.150.10.20",
        "opt_in_timestamp": "2026-08-11T12:16:47.977Z",
        "opt_in_signer_name": "LEAD 5511972323578",
        "opt_in_phone": "5511972323578",
        "opt_in_message_id": "wamid_optin_1786450608016",
        "opt_in_consent_text_version": "v1-2026-06",
        "opt_in_consent_text_hash": "b919e74d1075bbd1c44fcef663f7e691932d5eb1fe1e54f8b30a3032c2b30d8b",
        "opt_in_confirmation_message": "sim, autorizo"
      }
    },
    {
      name: '3. Standard 14-digit Valid CNPJ (e.g., 33000167000101)',
      body: {
        "contact_name": "LEAD 5511972323578",
        "contact_phone_number": "11972323578",
        "registration_code": "33000167000101",
        "revenue": 200000,
        "requested_amount": 150000,
        "opt_in": true,
        "opt_in_ip": "200.150.10.20",
        "opt_in_signer_name": "LEAD 5511972323578",
        "opt_in_timestamp": "2026-08-11T12:16:47Z"
      }
    },
    {
      name: '4. Without opt_in fields (opt_in: false)',
      body: {
        "contact_name": "LEAD 5511972323578",
        "contact_phone_number": "11972323578",
        "registration_code": "33000167000101",
        "revenue": 200000,
        "requested_amount": 150000
      }
    },
    {
      name: '5. Standard Fields Only with User CNPJ padded (02122551432290)',
      body: {
        "contact_name": "LEAD 5511972323578",
        "contact_phone_number": "11972323578",
        "registration_code": "02122551432290",
        "revenue": 200000,
        "requested_amount": 150000,
        "opt_in": true,
        "opt_in_ip": "200.150.10.20",
        "opt_in_signer_name": "LEAD 5511972323578",
        "opt_in_timestamp": "2026-08-11T12:16:47.977Z"
      }
    }
  ];

  for (const t of tests) {
    console.log(`\n=== Testing: ${t.name} ===`);
    const res = await post('https://apidev.moneymoneyinvest.com.br/business-partners/clover-capital/loan-requests', t.body, token);
    console.log('Status:', res.status, 'Body:', res.body);
  }
}

run();
