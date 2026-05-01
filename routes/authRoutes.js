const express = require('express');
const multer = require("multer");
const { register, login, registerUserSchool, getUserSchoolList, updateUserSchool, getMyProfile, updateMyProfile, deleteUserSchool } = require('../controllers/AuthController');
const { checkRole, verifyToken } = require('../middlewares/AuthMiddleware');
const { RegisterStudent } = require('../controllers/StudentController');

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post('/register', register);
router.post('/register/student', verifyToken, RegisterStudent);
router.post('/register/user-school', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN']), registerUserSchool);
router.get('/user-school', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN']), getUserSchoolList);
router.put('/user-school/:id', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN']), updateUserSchool);
router.delete('/user-school/:id', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN']), deleteUserSchool);
router.get('/profile', verifyToken, getMyProfile);
router.put('/profile', verifyToken, upload.single("profile_image"), updateMyProfile);
router.post('/login', login);

module.exports = router;
