require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const WC_API = 'https://worldcup26.ir';
const MECCA_OFFSET = 3;

// ============================================================
// قاعدة بيانات في الذاكرة (تستمر طالما السيرفر شغال)
// ============================================================
const DB = {
  users: {},       // email -> user object
  predictions: {}, // userId -> { matchId -> prediction }
};

// Cache
const cache = {};
function setCache(key, data, ttl = 60) {
  cache[key] = { data, expires: Date.now() + ttl * 1000 };
}
function getCache(key) {
  const c = cache[key];
  return c && c.expires > Date.now() ? c.data : null;
}

function getMeccaDate() {
  const now = new Date(Date.now() + MECCA_OFFSET * 3600000);
  return now.toISOString().split('T')[0];
}

function toMeccaTime(localDate) {
  if (!localDate) return {};
  try {
    const [datePart, timePart] = localDate.split(' ');
    const [month, day, year] = datePart.split('/');
    const [hour, minute] = timePart.split(':');
    const utc = new Date(Date.UTC(parseInt(year), parseInt(month)-1, parseInt(day), parseInt(hour)+6, parseInt(minute)));
    const mecca = new Date(utc.getTime() + MECCA_OFFSET * 3600000);
    const h = mecca.getUTCHours().toString().padStart(2,'0');
    const m = mecca.getUTCMinutes().toString().padStart(2,'0');
    return { date: mecca.toISOString().split('T')[0], time: `${h}:${m}`, display: `${h}:${m} مكة` };
  } catch { return {}; }
}

const TEAMS_AR = {
  'Mexico':'المكسيك','South Africa':'جنوب أفريقيا','South Korea':'كوريا الجنوبية',
  'Czech Republic':'تشيكيا','Czechia':'تشيكيا','Canada':'كندا',
  'Bosnia and Herzegovina':'البوسنة والهرسك','Bosnia':'البوسنة',
  'USA':'الولايات المتحدة','United States':'الولايات المتحدة','Paraguay':'باراغواي',
  'Qatar':'قطر','Switzerland':'سويسرا','Brazil':'البرازيل','Morocco':'المغرب',
  'Haiti':'هايتي','Scotland':'اسكتلندا','Australia':'أستراليا',
  'Turkey':'تركيا','Turkiye':'تركيا','Germany':'ألمانيا',
  'Curacao':'كوراساو','Curaçao':'كوراساو','Netherlands':'هولندا','Japan':'اليابان',
  'Ivory Coast':'كوت ديفوار',"Cote d'Ivoire":'كوت ديفوار',
  'Ecuador':'الإكوادور','Sweden':'السويد','Tunisia':'تونس','Spain':'إسبانيا',
  'Cape Verde':'الرأس الأخضر','Cabo Verde':'الرأس الأخضر','Belgium':'بلجيكا',
  'Egypt':'مصر','Saudi Arabia':'المملكة العربية السعودية','Uruguay':'أوروغواي',
  'Iran':'إيران','New Zealand':'نيوزيلندا','France':'فرنسا','Senegal':'السنغال',
  'Norway':'النرويج','Iraq':'العراق','Argentina':'الأرجنتين','Algeria':'الجزائر',
  'Austria':'النمسا','Jordan':'الأردن','Portugal':'البرتغال',
  'DR Congo':'الكونغو الديمقراطية','Congo DR':'الكونغو الديمقراطية',
  'Uzbekistan':'أوزبكستان','Colombia':'كولومبيا','England':'إنجلترا',
  'Croatia':'كرواتيا','Ghana':'غانا','Serbia':'صربيا','Poland':'بولندا',
  'Ukraine':'أوكرانيا','Indonesia':'إندونيسيا','Panama':'بنما',
  'Honduras':'هندوراس','Jamaica':'جامايكا','Venezuela':'فنزويلا',
  'Chile':'تشيلي','Peru':'بيرو','Costa Rica':'كوستاريكا',
  'Romania':'رومانيا','Denmark':'الدنمارك','Nigeria':'نيجيريا',
  'Cameroon':'الكاميرون','Tanzania':'تنزانيا','Angola':'أنغولا',
};
const ar = n => TEAMS_AR[n] || n;

function getStatusAr(m) {
  const finished = m.finished === 'TRUE' || m.finished === true;
  const elapsed = m.time_elapsed || '';
  if (finished || elapsed === 'finished') return 'انتهت ✅';
  if (elapsed && elapsed !== 'finished' && elapsed !== '' && elapsed !== 'notstarted') return `جارية ${elapsed}' 🔴`;
  return 'لم تبدأ ⏰';
}
function isLive(m) {
  const elapsed = m.time_elapsed || '';
  const finished = m.finished === 'TRUE' || m.finished === true;
  return !finished && elapsed !== '' && elapsed !== 'finished' && elapsed !== 'notstarted';
}
function isFinished(m) {
  return m.finished === 'TRUE' || m.finished === true || m.time_elapsed === 'finished';
}

function formatMatch(m) {
  const mecca = toMeccaTime(m.local_date);
  const homeScore = m.home_score && m.home_score !== 'null' ? parseInt(m.home_score) : null;
  const awayScore = m.away_score && m.away_score !== 'null' ? parseInt(m.away_score) : null;
  const homeName = m.home_team_name_en || '';
  const awayName = m.away_team_name_en || '';
  return {
    id: m.id || m._id || '',
    meccaDate: mecca.date || '',
    meccaTime: mecca.time || '--:--',
    localDate: m.local_date || '',
    group: `المجموعة ${m.group || ''}`,
    matchday: m.matchday || '',
    finished: isFinished(m),
    live: isLive(m),
    statusAr: getStatusAr(m),
    home: { name: homeName, nameAr: ar(homeName) },
    away: { name: awayName, nameAr: ar(awayName) },
    score: { home: homeScore, away: awayScore }
  };
}

// ============================================================
// ROUTES — الصفحة الرئيسية
// ============================================================
app.get('/', (req, res) => {
  res.json({
    api: '⚽ GoalPredict — كأس العالم 2026',
    todayMecca: getMeccaDate(),
    status: 'يعمل ✅',
    users: Object.keys(DB.users).length
  });
});

// ============================================================
// ROUTES — المباريات
// ============================================================
app.get('/api/fixtures/all', async (req, res) => {
  try {
    const cached = getCache('all');
    if (cached) return res.json(cached);
    const { data } = await axios.get(`${WC_API}/get/games`, { timeout: 10000 });
    const games = data.games || [];
    const matches = games.map(formatMatch);
    setCache('all', matches, 120);
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/fixtures/today', async (req, res) => {
  try {
    const today = getMeccaDate();
    const cached = getCache('all');
    const all = cached || (() => { throw new Error('no cache'); })();
    res.json(all.filter(m => m.meccaDate === today));
  } catch {
    try {
      const { data } = await axios.get(`${WC_API}/get/games`, { timeout: 10000 });
      const today = getMeccaDate();
      const matches = (data.games || []).map(formatMatch).filter(m => m.meccaDate === today);
      res.json(matches);
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
});

app.get('/api/fixtures/live', async (req, res) => {
  try {
    const { data } = await axios.get(`${WC_API}/get/games`, { timeout: 10000 });
    res.json((data.games || []).map(formatMatch).filter(m => m.live));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/standings', async (req, res) => {
  try {
    const cached = getCache('standings');
    if (cached) return res.json(cached);
    const { data } = await axios.get(`${WC_API}/get/groups`, { timeout: 10000 });
    const raw = data.groups || data || [];
    const groups = Array.isArray(raw) ? raw : Object.values(raw);
    const formatted = groups.map(g => ({
      group: `المجموعة ${g.group || g.name || ''}`,
      teams: (g.teams || []).map(t => ({
        rank: t.rank, name: t.name_en || t.name || '',
        nameAr: ar(t.name_en || t.name || ''),
        played: t.played||0, win: t.win||t.w||0, draw: t.draw||t.d||0,
        lose: t.lose||t.l||0, points: t.pts||t.points||0,
      }))
    }));
    setCache('standings', formatted, 300);
    res.json(formatted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// ROUTES — المستخدمون (محفوظون في السيرفر)
// ============================================================
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'أكمل جميع البيانات' });
  if (DB.users[email]) return res.status(400).json({ error: 'البريد الإلكتروني مسجّل مسبقاً' });
  const userId = 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
  DB.users[email] = { userId, name, email, password, points: 0, correct: 0, total: 0, createdAt: new Date().toISOString() };
  console.log(`[REG] ${name} (${email})`);
  res.json({ success: true, userId, name, email, points: 0, correct: 0, total: 0 });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = DB.users[email];
  if (!user) return res.status(401).json({ error: 'البريد الإلكتروني غير مسجّل' });
  if (user.password !== password) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  console.log(`[LOGIN] ${user.name} (${email})`);
  res.json({ success: true, userId: user.userId, name: user.name, email: user.email,
    points: user.points, correct: user.correct, total: user.total });
});

// جلب بيانات مستخدم
app.get('/api/users/:userId', (req, res) => {
  const user = Object.values(DB.users).find(u => u.userId === req.params.userId);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ userId: user.userId, name: user.name, email: user.email,
    points: user.points, correct: user.correct, total: user.total });
});

// كل المستخدمين (للإدارة)
app.get('/api/users', (req, res) => {
  const users = Object.values(DB.users).map(u => ({
    userId: u.userId, name: u.name, email: u.email,
    points: u.points, correct: u.correct, total: u.total, createdAt: u.createdAt
  }));
  res.json(users);
});

// حذف مستخدم
app.delete('/api/users/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  if (!DB.users[email]) return res.status(404).json({ error: 'المستخدم غير موجود' });
  delete DB.users[email];
  delete DB.predictions[email];
  res.json({ success: true });
});

// تصفير نقاط مستخدم
app.patch('/api/users/:email/reset', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  if (!DB.users[email]) return res.status(404).json({ error: 'المستخدم غير موجود' });
  DB.users[email].points = 0;
  DB.users[email].correct = 0;
  DB.users[email].total = 0;
  DB.predictions[DB.users[email].userId] = {};
  res.json({ success: true });
});

// ============================================================
// ROUTES — التوقعات
// ============================================================
app.post('/api/predictions', (req, res) => {
  const { userId, matchId, wdl, wdlLabel, scoreHome, scoreAway } = req.body;
  if (!userId || !matchId || !wdl) return res.status(400).json({ error: 'بيانات ناقصة' });
  if (!DB.predictions[userId]) DB.predictions[userId] = {};
  if (DB.predictions[userId][matchId]?.confirmed) return res.status(400).json({ error: 'تم تسجيل توقعك مسبقاً' });
  DB.predictions[userId][matchId] = { wdl, wdlLabel, s1: parseInt(scoreHome)||0, s2: parseInt(scoreAway)||0, confirmed: true, pts: 0, evaluated: false };
  // تحديث إجمالي التوقعات
  const user = Object.values(DB.users).find(u => u.userId === userId);
  if (user) { user.total++; }
  res.json({ success: true });
});

app.get('/api/predictions/:userId', (req, res) => {
  res.json(DB.predictions[req.params.userId] || {});
});

// لوحة المتصدرين
app.get('/api/leaderboard', (req, res) => {
  const lb = Object.values(DB.users)
    .sort((a, b) => b.points - a.points)
    .map((u, i) => ({ rank: i+1, name: u.name, points: u.points, correct: u.correct, total: u.total }));
  res.json(lb);
});

// ============================================================
// ROUTES — تقييم التوقعات بعد انتهاء المباراة
// ============================================================
app.post('/api/results', (req, res) => {
  const { matchId, homeScore, awayScore } = req.body;
  if (matchId === undefined || homeScore === undefined || awayScore === undefined)
    return res.status(400).json({ error: 'بيانات ناقصة' });
  const h = parseInt(homeScore), a = parseInt(awayScore);
  const actualWdl = h > a ? 'home' : h < a ? 'away' : 'draw';
  let updated = 0;
  Object.entries(DB.predictions).forEach(([userId, userPreds]) => {
    const pred = userPreds[matchId];
    if (!pred || pred.evaluated) return;
    const wok = pred.wdl === actualWdl;
    const eok = pred.s1 === h && pred.s2 === a;
    let pts = 0;
    if (wok) pts += 3;
    if (eok) pts += 5;
    pred.pts = pts; pred.evaluated = true;
    const user = Object.values(DB.users).find(u => u.userId === userId);
    if (user) {
      user.points = (user.points||0) + pts;
      if (wok) user.correct = (user.correct||0) + 1;
    }
    updated++;
  });
  res.json({ success: true, matchId, result: `${h}–${a}`, updated });
});

// توقع يدوي لمستخدم محدد (من الإدارة)
app.post('/api/predictions/manual', (req, res) => {
  const { email, matchId, wdl, wdlLabel, scoreHome, scoreAway, homeScore, awayScore } = req.body;
  const user = DB.users[email];
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (!DB.predictions[user.userId]) DB.predictions[user.userId] = {};

  const h = parseInt(homeScore), a = parseInt(awayScore);
  const s1 = parseInt(scoreHome)||0, s2 = parseInt(scoreAway)||0;
  const actualWdl = !isNaN(h) ? (h>a?'home':h<a?'away':'draw') : null;
  const wok = actualWdl ? wdl === actualWdl : false;
  const eok = actualWdl ? (s1===h && s2===a) : false;
  let pts = 0;
  if (wok) pts += 3;
  if (eok) pts += 5;

  const existing = DB.predictions[user.userId][matchId];
  if (!existing || !existing.confirmed) {
    DB.predictions[user.userId][matchId] = { wdl, wdlLabel, s1, s2, confirmed: true, pts, evaluated: actualWdl !== null };
    user.total = (user.total||0) + 1;
    user.points = (user.points||0) + pts;
    if (wok) user.correct = (user.correct||0) + 1;
  }
  res.json({ success: true, pts });
});

// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 GoalPredict يعمل على http://localhost:${PORT}`);
  console.log(`🕋 توقيت مكة UTC+3 | اليوم: ${getMeccaDate()}`);
  console.log(`👥 المستخدمون محفوظون في السيرفر (يستمرون طالما السيرفر شغال)\n`);
});
