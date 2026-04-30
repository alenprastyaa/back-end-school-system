const express = require('express');
const {createNewSchool} = require('../controllers/SchoolController')

const router = express.Router();
router.post('/', createNewSchool);

module.exports = router;