const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generate RSA key pair for JWT signing
 */
function generateKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  const keysDir = path.join(__dirname, '..', 'keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey);
  fs.writeFileSync(path.join(keysDir, 'public.pem'), publicKey);

  console.log('✅ RSA key pair generated successfully!');
  console.log(`Private key: ${path.join(keysDir, 'private.pem')}`);
  console.log(`Public key: ${path.join(keysDir, 'public.pem')}`);
  console.log('\n⚠️  Keep these keys secure! Do not commit them to version control.');
  console.log('\nAdd to your .env file:');
  console.log(`JWT_PRIVATE_KEY_PATH=${path.join(keysDir, 'private.pem')}`);
  console.log(`JWT_PUBLIC_KEY_PATH=${path.join(keysDir, 'public.pem')}`);
}

generateKeys();
