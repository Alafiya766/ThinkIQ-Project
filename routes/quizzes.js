const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Middleware: must be logged in
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: 'Not authenticated' });
  next();
}

// Middleware: must be admin
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

// GET /api/quizzes — get all quizzes (with question count)
router.get('/', requireAuth, async (req, res) => {
  try {
    const [quizzes] = await db.query(`
      SELECT q.id, q.title, q.created_at, u.name AS created_by,
             COUNT(qu.id) AS question_count
      FROM quizzes q
      LEFT JOIN users u ON q.created_by = u.id
      LEFT JOIN questions qu ON q.id = qu.quiz_id
      GROUP BY q.id
      ORDER BY q.created_at DESC
    `);
    res.json(quizzes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/quizzes/:id — get single quiz with questions
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [quizRows] = await db.query('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
    if (quizRows.length === 0) return res.status(404).json({ message: 'Quiz not found' });

    const [questions] = await db.query(
      'SELECT * FROM questions WHERE quiz_id = ?',
      [req.params.id]
    );

    // For users, hide correct answers
    const isAdmin = req.session.user.role === 'admin';
    const sanitizedQuestions = questions.map(q => ({
      id: q.id,
      question_text: q.question_text,
      option1: q.option1,
      option2: q.option2,
      option3: q.option3,
      option4: q.option4,
      ...(isAdmin ? { correct_answer: q.correct_answer } : {})
    }));

    res.json({ ...quizRows[0], questions: sanitizedQuestions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/quizzes — create quiz (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, questions } = req.body;

    if (!title || !questions || questions.length === 0) {
      return res.status(400).json({ message: 'Title and questions are required' });
    }

    const [result] = await db.query(
      'INSERT INTO quizzes (title, created_by) VALUES (?, ?)',
      [title, req.session.user.id]
    );

    const quizId = result.insertId;

    // Insert all questions
    for (const q of questions) {
      const { question_text, option1, option2, option3, option4, correct_answer } = q;
      if (!question_text || !option1 || !option2 || !option3 || !option4 || !correct_answer) continue;
      await db.query(
        'INSERT INTO questions (quiz_id, question_text, option1, option2, option3, option4, correct_answer) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [quizId, question_text, option1, option2, option3, option4, correct_answer]
      );
    }

    res.status(201).json({ message: 'Quiz created successfully', quizId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/quizzes/:id — delete quiz (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Quiz not found' });
    res.json({ message: 'Quiz deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/quizzes/:id/submit — submit quiz answers (user)
router.post('/:id/submit', requireAuth, async (req, res) => {
  try {
    const { answers } = req.body; // { questionId: selectedAnswer }

    const [questions] = await db.query(
      'SELECT id, correct_answer FROM questions WHERE quiz_id = ?',
      [req.params.id]
    );

    if (questions.length === 0) return res.status(404).json({ message: 'Quiz not found' });

    let score = 0;
    questions.forEach(q => {
      if (answers[q.id] && answers[q.id] === q.correct_answer) {
        score++;
      }
    });

    const total = questions.length;

    await db.query(
      'INSERT INTO results (user_id, quiz_id, score, total) VALUES (?, ?, ?, ?)',
      [req.session.user.id, req.params.id, score, total]
    );

    res.json({ message: 'Quiz submitted', score, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
