const {createClass, getClass, updateClass, getClassById, getClassByWaliGuru, deleteClass} = require('../models/ClassModel')
const { successResponse, errorResponse } = require('../utils/response')
const { getUsersByRoleAndSchool } = require('../models/UserModel')


const CreateClass = async (req, res)=>{
   try {
    const {class_name, wali_guru_id} = req.body
    const school_id = req.schoolId 
    if (!school_id){
        return  res.json({
            success : false,
            message : "school id required"
        })
    }
    if (wali_guru_id) {
      const teacher = await getUsersByRoleAndSchool(school_id, 'GURU');
      const validTeacher = teacher.find((item) => item.id === Number(wali_guru_id));
      if (!validTeacher) {
        return errorResponse(res, 400, "Selected homeroom teacher is invalid");
      }
    }
    const create = await createClass(class_name, school_id, wali_guru_id || null)
    return successResponse(res, 201, "class registered successfully", create);
   } catch (error) {
    return errorResponse(res, 500, "Registration failed", error.message);
   }
}

const GetClass = async(req, res)=>{
    try {
        const school_id =  req.schoolId
        const listClass = await getClass(school_id)
        return successResponse(res, 201, "Succes Get Data class", listClass)
    } catch (error) {
        return errorResponse(res, 500, "Faild Get Data Class")
    }
}

const UpdateClass = async (req, res) => {
    try {
        const { id } = req.params;
        const { class_name, wali_guru_id } = req.body;
        const school_id = req.schoolId;
        const currentClass = await getClassById(id);

        if (!currentClass || Number(currentClass.school_id) !== Number(school_id)) {
            return errorResponse(res, 404, "Class not found");
        }

        if (wali_guru_id) {
            const teachers = await getUsersByRoleAndSchool(school_id, 'GURU');
            const validTeacher = teachers.find((item) => item.id === Number(wali_guru_id));
            if (!validTeacher) {
                return errorResponse(res, 400, "Selected homeroom teacher is invalid");
            }
        }

        const updatedClass = await updateClass(
            id,
            class_name ?? currentClass.class_name,
            school_id,
            wali_guru_id ?? currentClass.wali_guru_id ?? null,
        );

        return successResponse(res, 200, "Success Update Class", updatedClass);
    } catch (error) {
        return errorResponse(res, 500, "Failed Update Class", error.message);
    }
};

const GetMyClass = async (req, res) => {
    try {
        const homeroomClass = await getClassByWaliGuru(req.userId, req.schoolId);
        if (!homeroomClass) {
            return errorResponse(res, 404, "Homeroom class not found");
        }

        return successResponse(res, 200, "Success Get Homeroom Class", homeroomClass);
    } catch (error) {
        return errorResponse(res, 500, "Failed Get Homeroom Class", error.message);
    }
};

const DeleteClass = async (req, res) => {
    try {
        const { id } = req.params;
        const school_id = req.schoolId;

        const currentClass = await getClassById(id);
        if (!currentClass || Number(currentClass.school_id) !== Number(school_id)) {
            return errorResponse(res, 404, "Class not found");
        }

        const deleted = await deleteClass(id, school_id);
        if (!deleted) {
            return errorResponse(res, 404, "Class not found or already deleted");
        }

        return successResponse(res, 200, `Kelas "${deleted.class_name}" berhasil dihapus`);
    } catch (error) {
        return errorResponse(res, 500, "Failed Delete Class", error.message);
    }
};

module.exports = {CreateClass, GetClass, UpdateClass, GetMyClass, DeleteClass}
