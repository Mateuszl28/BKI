require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');

const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());

/** Walidacja prostych danych */
function isValidEmail(email) {
  return typeof email === 'string' && /\S+@\S+\.\S+/.test(email);
}
function isValidPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8; // możesz zaostrzyć reguły
}

/** REJESTRACJA */
app.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!isValidEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({ error: 'Niepoprawny email lub hasło (min. 8 znaków).' });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Użytkownik już istnieje.' });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const user = await prisma.user.create({
      data: { email, passwordHash, name }
    });

    // (opcjonalnie) automatyczne zalogowanie po rejestracji:
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      message: 'Utworzono konto.',
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Błąd serwera.' });
  }
});

/** LOGOWANIE */
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!isValidEmail(email) || typeof password !== 'string') {
      return res.status(400).json({ error: 'Podaj poprawne dane logowania.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Nieprawidłowy email lub hasło.' });

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return res.status(401).json({ error: 'Nieprawidłowy email lub hasło.' });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Błąd serwera.' });
  }
});

/** Middleware autoryzacji JWT */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Brak tokenu.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(403).json({ error: 'Nieprawidłowy token.' });
  }
}

/** Endpoint chroniony */
app.get('/me', auth, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true }
  });
  res.json(me);
});

app.listen(PORT, () => console.log(`🚀 API działa na http://localhost:${PORT}`));
