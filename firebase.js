const admin = require('firebase-admin');

// ============================================================
// تهيئة Firebase Admin
// ============================================================
let firebaseApp = null;

function initFirebase() {
  if (firebaseApp) return firebaseApp;

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log('✅ Firebase متصل بنجاح');
  } catch (err) {
    console.error('❌ خطأ في Firebase:', err.message);
  }

  return firebaseApp;
}

// ============================================================
// Firestore — قاعدة البيانات
// ============================================================
function getDB() {
  initFirebase();
  return admin.firestore();
}

// حفظ مستخدم جديد
async function saveUser(userId, userData) {
  const db = getDB();
  await db.collection('users').doc(userId).set({
    ...userData,
    points: 0,
    correctPredictions: 0,
    totalPredictions: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

// جلب مستخدم
async function getUser(userId) {
  const db = getDB();
  const doc = await db.collection('users').doc(userId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

// تحديث نقاط مستخدم
async function updateUserPoints(userId, pointsToAdd, correctPred = false) {
  const db = getDB();
  await db.collection('users').doc(userId).update({
    points: admin.firestore.FieldValue.increment(pointsToAdd),
    totalPredictions: admin.firestore.FieldValue.increment(1),
    ...(correctPred && { correctPredictions: admin.firestore.FieldValue.increment(1) })
  });
}

// حفظ توقع
async function savePrediction(userId, matchId, predData) {
  const db = getDB();
  const ref = db.collection('predictions').doc(`${userId}_${matchId}`);
  const existing = await ref.get();
  if (existing.exists) throw new Error('لقد سجّلت توقعك مسبقاً');

  await ref.set({
    userId, matchId, ...predData,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

// جلب لوحة المتصدرين
async function getLeaderboard(limit = 50) {
  const db = getDB();
  const snapshot = await db.collection('users')
    .orderBy('points', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map((doc, i) => ({
    rank: i + 1,
    id: doc.id,
    name: doc.data().name,
    points: doc.data().points,
    correctPredictions: doc.data().correctPredictions,
    totalPredictions: doc.data().totalPredictions,
  }));
}

// ============================================================
// Firebase Cloud Messaging — الإشعارات
// ============================================================

// حفظ FCM token للمستخدم
async function saveUserToken(userId, fcmToken) {
  const db = getDB();
  await db.collection('users').doc(userId).update({
    fcmTokens: admin.firestore.FieldValue.arrayUnion(fcmToken)
  });
}

// إرسال إشعار لمستخدم واحد
async function sendNotificationToUser(userId, title, body, data = {}) {
  const db = getDB();
  const userDoc = await db.collection('users').doc(userId).get();
  const tokens = userDoc.data()?.fcmTokens || [];
  if (!tokens.length) return;

  const message = {
    notification: { title, body },
    data: { ...data },
    tokens
  };

  const response = await admin.messaging().sendEachForMulticast(message);
  console.log(`[FCM] أرسل لـ ${userId}: ${response.successCount} نجاح`);
  return response;
}

// إرسال إشعار لكل المستخدمين (Topic)
async function sendNotificationToAll(title, body, data = {}) {
  const message = {
    notification: { title, body },
    data: { ...data },
    topic: 'worldcup2026'
  };

  const response = await admin.messaging().send(message);
  console.log(`[FCM] إشعار عام أرسل: ${response}`);
  return response;
}

// ============================================================
// دوال الإشعارات الجاهزة
// ============================================================

// إشعار قبل المباراة بـ 30 دقيقة
async function notifyMatchStartingSoon(match) {
  const title = `⏰ مباراة تبدأ خلال 30 دقيقة!`;
  const body = `${match.home.name} 🆚 ${match.away.name} — سجّل توقعك الآن`;
  await sendNotificationToAll(title, body, {
    type: 'MATCH_SOON',
    matchId: match.id.toString()
  });
  console.log(`[NOTIF] إشعار بدء مباراة: ${match.home.name} vs ${match.away.name}`);
}

// إشعار نتيجة التوقع
async function notifyPredictionResult(userId, matchName, isCorrect, points) {
  const title = isCorrect ? '🎉 توقعك كان صحيحاً!' : '❌ توقعك لم يكن دقيقاً';
  const body = isCorrect
    ? `أحسنت! ربحت ${points} نقاط من مباراة ${matchName}`
    : `للأسف توقعك خاطئ في مباراة ${matchName}. حظاً أفضل!`;
  await sendNotificationToUser(userId, title, body, {
    type: 'PREDICTION_RESULT',
    points: points.toString()
  });
}

// إشعار تحديث الترتيب
async function notifyLeaderboardUpdate(userId, newRank, points) {
  const title = '🏆 تم تحديث الترتيب!';
  const body = `أنت الآن في المرتبة #${newRank} بـ ${points} نقطة`;
  await sendNotificationToUser(userId, title, body, {
    type: 'LEADERBOARD_UPDATE',
    rank: newRank.toString()
  });
}

module.exports = {
  initFirebase, getDB,
  saveUser, getUser, updateUserPoints,
  savePrediction, getLeaderboard,
  saveUserToken,
  sendNotificationToUser, sendNotificationToAll,
  notifyMatchStartingSoon, notifyPredictionResult, notifyLeaderboardUpdate
};
