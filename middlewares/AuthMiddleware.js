const jwt = require('jsonwebtoken');
const { errorResponse } = require('../utils/response');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return errorResponse(res, 403, "No token provided");

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return errorResponse(res, 401, "Unauthorized");
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.schoolId = decoded.schoolId;
    next();
  });
};

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.userRole)) {
      return errorResponse(res, 403, "Forbidden: Insufficient privileges");
    }
    next();
  };
};

module.exports = { verifyToken, checkRole };