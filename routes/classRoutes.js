const express = require('express');
const { CreateClass, GetClass, UpdateClass, GetMyClass } = require('../controllers/ClassController');
const { verifyToken, checkRole } = require('../middlewares/AuthMiddleware');

const router = express.Router();
router.post('/', verifyToken, CreateClass);
router.get('/', verifyToken, GetClass);
router.put('/:id', verifyToken, UpdateClass);
router.get('/my/homeroom', verifyToken, checkRole(['GURU']), GetMyClass);

module.exports = router;
