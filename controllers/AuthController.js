const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/UserModel');
const SchoolModel = require('../models/SchoolModel')
const { successResponse, errorResponse } = require('../utils/response');
const { uploadImage } = require("../utils/upload");
const fs = require("fs");

const removeLocalUpload = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const register = async (req, res) => {
  const { username, password, role, school_id } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 8);
    const user = await UserModel.createUser(username, hashedPassword, role, school_id);
    return successResponse(res, 201, "User registered successfully", user);
  } catch (error) {
    return errorResponse(res, 500, "Registration failed", error.message);
  }
};

const registerUserSchool = async (req, res) => {
  const { username, password, role, parent_email, phone_number } = req.body;
  const school_id = req.schoolId
  try {
    const hashedPassword = await bcrypt.hash(password, 8);
    const user = await UserModel.createUser(
      username,
      hashedPassword,
      role,
      school_id,
      parent_email || null,
      phone_number || null,
    );
    return successResponse(res, 201, "User registered successfully", user);
  } catch (error) {
    return errorResponse(res, 500, "Registration failed", error.message);
  }
};

const getUserSchoolList = async (req, res) => {
  try {
    const { role } = req.query;
    const users = await UserModel.getUsersByRoleAndSchool(req.schoolId, role);
    return successResponse(res, 200, "Success Get User School", users);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get User School", error.message);
  }
};

const updateUserSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role, parent_email, phone_number } = req.body;
    const currentUser = await UserModel.getUserById(id);

    if (!currentUser || Number(currentUser.school_id) !== Number(req.schoolId)) {
      return errorResponse(res, 404, "User school not found");
    }

    if (!["ADMIN", "GURU"].includes(currentUser.role)) {
      return errorResponse(res, 400, "Only school admin and teacher can be updated here");
    }

    if (role && !["ADMIN", "GURU"].includes(role)) {
      return errorResponse(res, 400, "Invalid role");
    }

    const hashedPassword = password ? await bcrypt.hash(password, 8) : null;
    const updatedUser = await UserModel.updateUserSchool(
      id,
      username ?? currentUser.username,
      role ?? currentUser.role,
      req.schoolId,
      parent_email ?? currentUser.parent_email ?? null,
      phone_number ?? currentUser.phone_number ?? null,
      hashedPassword,
    );

    return successResponse(res, 200, "User school updated successfully", updatedUser);
  } catch (error) {
    return errorResponse(res, 500, "Failed Update User School", error.message);
  }
};


const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await UserModel.findByUsername(username);
    if (!user) return errorResponse(res, 404, "User not found");
    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) return errorResponse(res, 401, "Invalid Password");

    let schoolName = null;
    if (user.school_id) {
      const school = await SchoolModel.findSchoolById(user.school_id);
      if (school) schoolName = school.name;
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, schoolId: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: 86400 }
    );
    return successResponse(res, 200, "Login successful", {  
        role: user.role, 
        username: user.username,
        school_id: user.school_id,
        school_name: schoolName, 
        profile_image: user.profile_image || null,
        token });
  } catch (error) {
    return errorResponse(res, 500, "Login failed", error.message);
  }
};

const getMyProfile = async (req, res) => {
  try {
    const profile = await UserModel.getOwnProfile(req.userId);
    if (!profile) {
      return errorResponse(res, 404, "User not found");
    }

    return successResponse(res, 200, "Success Get Profile", profile);
  } catch (error) {
    return errorResponse(res, 500, "Failed Get Profile", error.message);
  }
};

const updateMyProfile = async (req, res) => {
  const filePath = req.file?.path || null;

  try {
    const profile = await UserModel.getUserById(req.userId);
    if (!profile) {
      removeLocalUpload(filePath);
      return errorResponse(res, 404, "User not found");
    }

    const currentPassword = String(req.body?.current_password || "");
    const newPassword = String(req.body?.new_password || "");
    const confirmPassword = String(req.body?.confirm_password || "");

    if (!req.file && !newPassword) {
      return errorResponse(res, 400, "Tidak ada perubahan yang dikirim");
    }

    let hashedPassword = null;
    if (newPassword) {
      if (!currentPassword) {
        removeLocalUpload(filePath);
        return errorResponse(res, 400, "Password saat ini wajib diisi");
      }

      const passwordMatches = await bcrypt.compare(currentPassword, profile.password || "");
      if (!passwordMatches) {
        removeLocalUpload(filePath);
        return errorResponse(res, 400, "Password saat ini tidak sesuai");
      }

      if (newPassword.length < 6) {
        removeLocalUpload(filePath);
        return errorResponse(res, 400, "Password baru minimal 6 karakter");
      }

      if (newPassword !== confirmPassword) {
        removeLocalUpload(filePath);
        return errorResponse(res, 400, "Konfirmasi password tidak sama");
      }

      hashedPassword = await bcrypt.hash(newPassword, 8);
    }

    let profileImage;
    if (req.file) {
      profileImage = await uploadImage(req.file);
      removeLocalUpload(filePath);
    }

    await UserModel.updateOwnProfile({
      id: req.userId,
      hashedPassword,
      profileImage,
    });

    const updatedProfile = await UserModel.getOwnProfile(req.userId);
    return successResponse(res, 200, "Profil berhasil diperbarui", updatedProfile);
  } catch (error) {
    console.log(error);
    removeLocalUpload(filePath);
    return errorResponse(res, 500, "Failed Update Profile", error.message);
  }
};

module.exports = { register, login, registerUserSchool, getUserSchoolList, updateUserSchool, getMyProfile, updateMyProfile };
