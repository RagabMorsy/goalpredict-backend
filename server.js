require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json());

const WC_API = 'https://worldcup26.ir';
const MECCA_OFFSET = 3;

// Cache
const cache = {};
function setCache(key, data, ttl = 60) {
  cache[key] = { data, expires: Date.now() + ttl * 1000 };
}
function getCache(key) {
  const c = cache[key];
  return c && c.expires > Date.now() ? c.data : null;
}

// تاريخ اليوم بتوقيت مكة
function getMeccaDate() {
  const now = new Date(Date.now() + MECCA_OFFSET * 3600000);
  return now.toISOString().split('T')[0];
}

// تحويل التاريخ المحلي "06/11/2026 13:00" لتوقيت مكة
// التاريخ في API هو بتوقيت CST (UTC-6) — وقت المكسيك
function parseMatchTime(localDate) {
  if (!localDate) return {};
  try {
    // الصيغة: "MM/DD/YYYY HH:MM"
    const [datePart, timePart] = localDate.split(' ');
    const [month, day, year] = datePart.split('/');
    const [hour, minute] = timePart.split(':');
    // نحول من CST (UTC-6) لـ UTC ثم لمكة (UTC+3)
    const utc = new Date(Date.UTC(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hour) + 6, parseInt(minute) // +6 لتحويل CST → UTC
    ));
    const mecca = new Date(utc.getTime() + MECCA_OFFSET * 3600000);
    const h = mecca.getUTCHours().toString().padStart(2, '0');
    const m = mecca.getUTCMinutes().toString().padStart(2, '0');
    return {
      date: mecca.toISOString().split('T')[0],
      time: `${h}:${m}`,
      display: `${h}:${m} مكة`
    };
  } catch { return {}; }
}

// أسماء الفرق بالعربي
const TEAMS_AR = {
  'Mexico':'المكسيك','South Africa':'جنوب أفريقيا','South Korea':'كوريا الجنوبية',
  'Czech Republic':'تشيكيا','Czechia':'تشيكيا','Canada':'كندا',
  'Bosnia and Herzegovina':'البوسنة والهرسك','USA':'الولايات المتحدة',
  'United States':'الولايات المتحدة','Paraguay':'باراغواي','Qatar':'قطر',
  'Switzerland':'سويسرا','Brazil':'البرازيل','Morocco':'المغرب',
  'Haiti':'هايتي','Scotland':'اسكتلندا','Australia':'أستراليا',
  'Turkey':'تركيا','Turkiye':'تركيا','Germany':'ألمانيا',
  'Curacao':'كوراساو','Curaçao':'كوراساو','Netherlands':'هولندا',
  'Japan':'اليابان','Ivory Coast':'كوت ديفوار',"Cote d'Ivoire":'كوت ديفوار',
  'Ecuador':'الإكوادور','Sweden':'السويد','Tunisia':'تونس',
  'Spain':'إسبانيا','Cape Verde':'الرأس الأخضر','Cabo Verde':'الرأس الأخضر',
  'Belgium':'بلجيكا','Egypt':'مصر','Saudi Arabia':'المملكة العربية السعودية',
  'Uruguay':'أوروغواي','Iran':'إيران','New Zealand':'نيوزيلندا',
  'France':'فرنسا','Senegal':'السنغال','Norway':'النرويج',
  'Iraq':'العراق','Argentina':'الأرجنتين','Algeria':'الجزائر',
  'Austria':'النمسا','Jordan':'الأردن','Portugal':'البرتغال',
  'DR Congo':'الكونغو الديمقراطية','Uzbekistan':'أوزبكستان',
  'Colombia':'كولومبيا','England':'إنجلترا','Croatia':'كرواتيا',
  'Ghana':'غانا','Serbia':'صربيا','Poland':'بولندا',
  'Ukraine':'أوكرانيا','Indonesia':'إندونيسيا','Panama':'بنما',
  'Honduras':'هندوراس','Costa Rica':'كوستاريكا','Jamaica':'جامايكا',
  'Venezuela':'فنزويلا','Chile':'تشيلي','Peru':'بيرو',
};
const ar = n => TEAMS_AR[n] || n;

// حالة المباراة بالعربي
function getStatusAr(m) {
  const finished = m.finished === 'TRUE' || m.finished === true;
  const elapsed = m.time_elapsed || '';
  if (finished || elapsed === 'finished') return 'انتهت ✅';
  if (elapsed && elapsed !== 'finished' && elapsed !== '') return `جارية ${elapsed}'  🔴`;
  return 'لم تبدأ ⏰';
}

function isLive(m) {
  const elapsed = m.time_elapsed || '';
  const finished = m.finished === 'TRUE' || m.finished === true;
  return !finished && elapsed !== '' && elapsed !== 'finished';
}

function isFinished(m) {
  return m.finished === 'TRUE' || m.finished === true || m.time_elapsed === 'finished';
}

// تنسيق مباراة
function formatMatch(m) {
  const mecca = parseMatchTime(m.local_date);
  const homeScore = m.home_score !== 'null' ? parseInt(m.home_score) : null;
  const awayScore = m.away_score !== 'null' ? parseInt(m.away_score) : null;
  const homeName = m.home_team_name_en || '';
  const awayName = m.away_team_name_en || '';

  return {
    id: m.id || m._id || '',
    meccaDate: mecca.date || '',
    meccaTime: mecca.time || '--:--',
    meccaDisplay: mecca.display || '',
    localDate: m.local_date || '',
    group: `المجموعة ${m.group || ''}`,
    matchday: m.matchday || '',
    type: m.type || 'group',
    finished: isFinished(m),
    live: isLive(m),
    statusAr: getStatusAr(m),
    elapsed: m.time_elapsed || '',
    home: {
      name: homeName,
      nameAr: ar(homeName),
      scorers: m.home_scorers || ''
    },
    away: {
      name: awayName,
      nameAr: ar(awayName),
      scorers: m.away_scorers || ''
    },
    score: {
      home: homeScore,
      away: awayScore
    }
  };
}

// ============================================================
// ROUTES
// ============================================================
app.get('/', (req, res) => {
  res.json({
    api: '⚽ GoalPredict — كأس العالم 2026',
    todayMecca: getMeccaDate(),
    status: 'يعمل ✅',
    endpoints: {
      all: '/api/fixtures/all',
      today: '/api/fixtures/today',
      live: '/api/fixtures/live',
      standings: '/api/standings'
    }
  });
});

// كل المباريات
app.get('/api/fixtures/all', async (req, res) => {
  try {
    const cached = getCache('all');
    if (cached) return res.json(cached);

    const { data } = await axios.get(`${WC_API}/get/games`, { timeout: 10000 });
    const games = data.games || [];
    const matches = games.map(formatMatch);
    console.log(`[ALL] ${matches.length} مباراة`);
    setCache('all', matches, 300);
    res.json(matches);
  } catch (err) {
    console.error('[ALL]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// مباريات اليوم بتوقيت مكة
app.get('/api/fixtures/today', async (req, res) => {
  try {
    const today = getMeccaDate();
    const cached = getCache(`today_${today}`);
    if (cached) return res.json(cached);

    const { data } = await axios.get(`${WC_API}/get/games`, { timeout: 10000 });
    const games = data.games || [];
    const todayMatches = games.map(formatMatch).filter(m => m.meccaDate === today);

    console.log(`[TODAY] ${today} — ${todayMatches.length} مباراة`);
    setCache(`today_${today}`, todayMatches, 60);
    res.json(todayMatches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// المباريات الحية الآن
app.get('/api/fixtures/live', async (req, res) => {
  try {
    const { data } = await axios.get(`${WC_API}/get/games`, { timeout: 10000 });
    const games = data.games || [];
    const live = games.map(formatMatch).filter(m => m.live);
    res.json(live);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ترتيب المجموعات
app.get('/api/standings', async (req, res) => {
  try {
    const cached = getCache('standings');
    if (cached) return res.json(cached);

    const { data } = await axios.get(`${WC_API}/get/groups`, { timeout: 10000 });
    // استخراج المجموعات من أي صيغة
    const raw = data.groups || data.data || data || [];
    const groups = Array.isArray(raw) ? raw : Object.values(raw);

    const formatted = groups.map(g => ({
      group: `المجموعة ${g.group || g.name || ''}`,
      teams: (g.teams || []).map(t => ({
        rank: t.rank || t.position || '',
        name: t.name_en || t.name || '',
        nameAr: ar(t.name_en || t.name || ''),
        flag: t.flag || '',
        played: t.played || t.mp || 0,
        win: t.win || t.w || 0,
        draw: t.draw || t.d || 0,
        lose: t.lose || t.l || 0,
        goalsFor: t.gf || t.goals_for || 0,
        goalsAgainst: t.ga || t.goals_against || 0,
        points: t.pts || t.points || 0,
      }))
    }));

    setCache('standings', formatted, 300);
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// المستخدمون والتوقعات
// ============================================================
const users = {};
const predictions = {};

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'أكمل جميع البيانات' });
  if (users[email]) return res.status(400).json({ error: 'البريد مسجّل مسبقاً' });
  const userId = 'u_' + Date.now();
  users[email] = { userId, name, email, points: 0, correct: 0, total: 0 };
  res.json({ success: true, userId, name, email, points: 0 });
});

app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  const user = users[email];
  if (!user) return res.status(401).json({ error: 'البريد غير مسجّل' });
  res.json({ success: true, ...user });
});

app.post('/api/predictions', (req, res) => {
  const { userId, matchId, wdl, scoreHome, scoreAway } = req.body;
  if (!userId || !matchId || !wdl) return res.status(400).json({ error: 'بيانات ناقصة' });
  if (!predictions[userId]) predictions[userId] = {};
  if (predictions[userId][matchId]) return res.status(400).json({ error: 'سجّلت توقعك مسبقاً' });
  predictions[userId][matchId] = { wdl, scoreHome, scoreAway, createdAt: new Date().toISOString() };
  res.json({ success: true });
});

app.get('/api/predictions/:userId', (req, res) => {
  res.json(predictions[req.params.userId] || {});
});

app.get('/api/leaderboard', (req, res) => {
  const lb = Object.values(users)
    .sort((a, b) => b.points - a.points)
    .map((u, i) => ({ rank: i + 1, name: u.name, points: u.points, correct: u.correct, total: u.total }));
  res.json(lb);
});

// ============================================================
// CRON — تحديث كل دقيقة
// ============================================================
cron.schedule('* * * * *', async () => {
  try {
    const { data } = await axios.get(`${WC_API}/get/games`, { timeout: 8000 });
    const games = data.games || [];
    const today = getMeccaDate();
    const all = games.map(formatMatch);
    setCache('all', all, 300);
    setCache(`today_${today}`, all.filter(m => m.meccaDate === today), 60);
    const live = all.filter(m => m.live);
    if (live.length) console.log(`[CRON] ${live.length} مباراة حية`);
  } catch {}
});

// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 GoalPredict يعمل على http://localhost:${PORT}`);
  console.log(`🕋 توقيت مكة UTC+3 | اليوم: ${getMeccaDate()}\n`);
});
