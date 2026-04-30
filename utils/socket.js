let ioInstance = null;

const setIo = (io) => {
  ioInstance = io;
};

const getIo = () => ioInstance;

const getLearningSubjectRoom = (subjectId) => `learning-subject-${Number(subjectId)}`;
const getUserNotificationRoom = (userId) => `user-notification-${Number(userId)}`;

module.exports = {
  setIo,
  getIo,
  getLearningSubjectRoom,
  getUserNotificationRoom,
};
