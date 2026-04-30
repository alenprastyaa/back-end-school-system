const {  createSchool } = require("../models/SchoolModel");
const { successResponse, errorResponse } = require("../utils/response");


const createNewSchool = async (req, res) => {
  const {name} = req.body;
  try {
    const school = await createSchool (name);
    return successResponse(res, 201, "school registered successfully", school);
  } catch (error) {
    return errorResponse(res, 500, "Registration failed", error.message);
  }
};


module.exports = {createNewSchool}