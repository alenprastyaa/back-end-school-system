const express = require('express');
const { getSuperAdminDashboard, getAdminDashboard, getGuruDashboard, getSiswaDashboard } = require('../controllers/DashboardController');
const { verifyToken, checkRole } = require('../middlewares/AuthMiddleware');

const router = express.Router();

router.use(verifyToken);

router.get('/superadmin', checkRole(['SUPER_ADMIN']), getSuperAdminDashboard);
router.get('/admin', checkRole(['SUPER_ADMIN', 'ADMIN']), getAdminDashboard);
router.get('/guru', checkRole(['SUPER_ADMIN', 'ADMIN', 'GURU']), getGuruDashboard);
router.get('/siswa', checkRole(['SUPER_ADMIN', 'ADMIN', 'GURU', 'SISWA']), getSiswaDashboard);

module.exports = router;