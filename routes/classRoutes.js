const express = require('express');
const { CreateClass, GetClass, UpdateClass, GetMyClass, DeleteClass } = require('../controllers/ClassController');
const { verifyToken, checkRole } = require('../middlewares/AuthMiddleware');

const router = express.Router();
router.post('/', verifyToken, CreateClass);
router.get('/', verifyToken, GetClass);
router.put('/:id', verifyToken, UpdateClass);
router.delete('/:id', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN']), DeleteClass);
router.get('/my/homeroom', verifyToken, checkRole(['GURU']), GetMyClass);

module.exports = router;
