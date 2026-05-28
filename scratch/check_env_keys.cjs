const fs = require('fs');

try {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const lines = envFile.split('\n');
  const keys = lines.map(line => {
    const parts = line.split('=');
    return parts[0].trim();
  }).filter(Boolean);
  
  console.log('Environment variable keys in .env.local:', keys);
} catch (err) {
  console.error('Error reading .env.local:', err);
}
