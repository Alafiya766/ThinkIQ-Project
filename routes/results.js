const express = require('express');
const router = express.Router();
const db = require('../config/db');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: 'Not authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

// GET /api/results — admin gets all results
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT r.id, u.name AS user, q.title AS quiz,
             r.score, r.total, r.submitted_at
      FROM results r
      JOIN users u ON r.user_id = u.id
      JOIN quizzes q ON r.quiz_id = q.id
      ORDER BY r.submitted_at DESC
    `);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/results/mine — logged-in user's own results
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT r.id, q.title AS quiz, r.score, r.total, r.submitted_at
      FROM results r
      JOIN quizzes q ON r.quiz_id = q.id
      WHERE r.user_id = ?
      ORDER BY r.submitted_at DESC
    `, [req.session.user.id]);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
