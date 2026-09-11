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
      name: '1. CNPJ com 14 dígitos mas DÍGITOS VERIFICADORES INVÁLIDOS (ex: 11111111111111)',
      body: {
        "contact_name": "Teste CNPJ Invalido 1",
        "contact_phone_number": "11972323578",
        "registration_code": "11111111111111",
        "revenue": 200000,
        "requested_amount": 150000
      }
    },
    {
      name: '2. CNPJ com 14 dígitos sequenciais inválidos (ex: 12345678901234)',
      body: {
        "contact_name": "Teste CNPJ Invalido 2",
        "contact_phone_number": "11972323578",
        "registration_code": "12345678901234",
        "revenue": 200000,
        "requested_amount": 150000
      }
    },
    {
      name: '3. CNPJ com caracteres não-numéricos se passados sem limpar (ex: "02.122.551/4322-90")',
      body: {
        "contact_name": "Teste CNPJ Formatado",
        "contact_phone_number": "11972323578",
        "registration_code": "02.122.551/4322-90",
        "revenue": 200000,
        "requested_amount": 150000
      }
    },
    {
      name: '4. CNPJ inexistente mas com cálculo matemático de DV válido (ex: 00000000000191)',
      body: {
        "contact_name": "Teste CNPJ Inexistente",
        "contact_phone_number": "11972323578",
        "registration_code": "00000000000191",
        "revenue": 200000,
        "requested_amount": 150000
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
