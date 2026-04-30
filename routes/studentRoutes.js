const express = require('express');
const { verifyToken, checkRole } = require('../middlewares/AuthMiddleware');
const { GetStudents, EditStudents, GetMyClassStudents, GetStudentAttendanceForTeacher, GetStudentReceiptForTeacher } = require('../controllers/StudentController');

const router = express.Router();
router.get('/', verifyToken, GetStudents  );
router.get('/my-class', verifyToken, checkRole(['GURU']), GetMyClassStudents);
router.get('/:id/attendance', verifyToken, checkRole(['GURU']), GetStudentAttendanceForTeacher);
router.get('/:id/receipt', verifyToken, checkRole(['GURU']), GetStudentReceiptForTeacher);
router.put('/:id', verifyToken, EditStudents );

module.exports = router;
