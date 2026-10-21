// Oʻqituvchi parolini tiklash. Avval serverni toʻxtating, keyin:
//   node tools/reset-password.js <login> <yangi-parol>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [login, password] = process.argv.slice(2);
if (!login || !password || password.length < 6) {
  console.log('Foydalanish: node tools/reset-password.js <email yoki telefon> <yangi parol (kamida 6 belgi)>');
  process.exit(1);
}
const file = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'users.json');
const users = JSON.parse(fs.readFileSync(file, 'utf8'));
const digits = login.replace(/[\s()-]/g, '');
const user = users.find(u => u.login === login.trim().toLowerCase() || u.login.endsWith(digits.replace(/^\+/, '')));
if (!user) {
  console.log('Topilmadi. Mavjud loginlar:\n' + users.map(u => `  ${u.login}  (${u.name})`).join('\n'));
  process.exit(1);
}
user.salt = crypto.randomBytes(16).toString('hex');
user.hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
fs.writeFileSync(file, JSON.stringify(users, null, 2));
console.log(`✔ ${user.name} (${user.login}) uchun parol yangilandi`);
