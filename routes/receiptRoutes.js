const express = require('express');
const multer = require("multer");
const { CreateReceipts, GetReceipt } = require('../controllers/ReceiptController');
const { verifyToken } = require('../middlewares/AuthMiddleware');

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post('/', verifyToken, upload.single("image"), CreateReceipts);
router.get('/', verifyToken, GetReceipt);

module.exports = router;
