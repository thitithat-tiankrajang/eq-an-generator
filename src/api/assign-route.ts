import express from 'express';
const { Router } = express;
import { 
  createAssignment,
  assignStudents,
  getAssignment,
  startAssignment,
  submitAnswer,
  updateStudentStatus,
  getStudentAssignments,
  getStudentAssignment,
  getAllAssignments,
  getAvailableStudents,
  getCurrentOptionSet,
  setCurrentQuestionElements,
  getStudentAnswers
} from '../controllers/assignment.js';
import { 
  authMiddleware, 
  requireAdmin, 
  requireApprovedUser,
  type AuthRequest
} from '../middleware/auth.js';

const router = Router();

// =================
// Admin Only Routes
// =================

/**
 * POST /assignments
 * สร้างงานใหม่ (เฉพาะ Admin)
 * Body: { title, description, totalQuestions, dueDate, optionSets? }
 * Headers: Authorization: Bearer <token>
 */
router.post('/', authMiddleware, requireAdmin, createAssignment);

/**
 * GET /assignments
 * ดูรายการงานทั้งหมดของ Admin
 * Query: ?page=1&limit=10&search=keyword
 * Headers: Authorization: Bearer <token>
 */
router.get('/', authMiddleware, requireAdmin, getAllAssignments);

/**
 * GET /assignments/available-students
 * ดูรายการ Student ที่ได้รับการอนุมัติสำหรับการมอบหมายงาน
 * Headers: Authorization: Bearer <token>
 */
router.get('/available-students', authMiddleware, requireAdmin, getAvailableStudents);

/**
 * POST /assignments/:id/assign
 * มอบหมายงานให้นักเรียน (เฉพาะ Admin)
 * Body: { studentIds: [string] }
 * Headers: Authorization: Bearer <token>
 */
router.post('/:id/assign', authMiddleware, requireAdmin, assignStudents);

/**
 * NOTE: Place more specific nested routes BEFORE the generic '/:id' route to avoid ambiguous matches
 */

/**
 * GET /assignments/:id/students/:studentId/current-set
 * ดึง option set ปัจจุบันสำหรับนักเรียน
 * สามารถเข้าถึงได้โดย: Admin (ดูข้อมูลนักเรียนใดก็ได้) หรือ Student (ดูข้อมูลตนเอง)
 * Headers: Authorization: Bearer <token>
 */
router.get('/:id/students/:studentId/current-set', authMiddleware, requireApprovedUser, getCurrentOptionSet);

/**
 * PATCH /assignments/:id/students/:studentId/current-question
 * บันทึก elements ของโจทย์ปัจจุบัน
 */
router.patch('/:id/students/:studentId/current-question', authMiddleware, requireApprovedUser, setCurrentQuestionElements);

/**
 * GET /assignments/:id/students/:studentId/answers
 * ดึงคำตอบของนักเรียนแบบ lazy (Admin หรือเจ้าของเอง)
 */
router.get('/:id/students/:studentId/answers', authMiddleware, requireApprovedUser, getStudentAnswers);

/**
 * GET /assignments/:id
 * ดูข้อมูลงานพร้อมความคืบหน้าของนักเรียน (เฉพาะ Admin)
 * Headers: Authorization: Bearer <token>
 */
router.get('/:id', authMiddleware, requireAdmin, getAssignment);

/**
 * PATCH /assignments/:id/students/:studentId/status
 * อัปเดตสถานะของนักเรียน (เฉพาะ Admin)
 * Body: { status: 'todo'|'inprogress'|'complete'|'done' }
 * Headers: Authorization: Bearer <token>
 */
router.patch('/:id/students/:studentId/status', authMiddleware, requireAdmin, updateStudentStatus);

// =================
// Mixed Access Routes (Admin + Student)
// =================

/**
 * PATCH /assignments/:id/students/:studentId/start
 * นักเรียนเริ่มทำงาน หรือ Admin เริ่มงานให้นักเรียน
 * (เปลี่ยนสถานะจาก todo เป็น inprogress)
 * Headers: Authorization: Bearer <token>
 */
router.patch('/:id/students/:studentId/start', authMiddleware, requireApprovedUser, startAssignment);

/**
 * POST /assignments/:id/students/:studentId/answers
 * นักเรียนส่งคำตอบ หรือ Admin ส่งคำตอบให้นักเรียน
 * Body: { questionNumber, questionText, answerText }
 * Headers: Authorization: Bearer <token>
 */
router.post('/:id/students/:studentId/answers', authMiddleware, requireApprovedUser, submitAnswer);

// (moved above the generic '/:id' route)

/**
 * GET /assignments/students/:studentId/assignments
 * ดูงานที่ได้รับมอบหมายของนักเรียน
 * สามารถเข้าถึงได้โดย: Admin (ดูข้อมูลนักเรียนใดก็ได้) หรือ Student (ดูข้อมูลตนเอง)
 * Query: ?status=todo|inprogress|complete|done&page=1&limit=10
 * Headers: Authorization: Bearer <token>
 */
router.get('/students/:studentId/assignments', authMiddleware, requireApprovedUser, getStudentAssignments);

/**
 * GET /assignments/students/:studentId/assignments/:assignmentId
 * ดูรายละเอียดงานเฉพาะของนักเรียน (student context)
 * เปิดสิทธิ์ให้ทั้ง Admin และ Student ที่ได้รับงาน
 */
router.get('/students/:studentId/assignments/:assignmentId', authMiddleware, requireApprovedUser, getStudentAssignment);

// =================
// Utility Routes
// =================

/**
 * GET /assignments/health
 * ตรวจสอบสถานะของระบบ Assignment
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Assignment system is running',
    timestamp: new Date().toISOString(),
    features: {
      assignmentCreation: true,
      studentAssignment: true,
      progressTracking: true,
      answerSubmission: true,
      statusManagement: true,
      dueDataTracking: true,
      optionSets: true,
      progressionLogic: true
    },
    supportedStatuses: ['todo', 'inprogress', 'complete', 'done'],
    endpoints: {
      admin: [
        'POST /assignments',
        'GET /assignments', 
        'POST /assignments/:id/assign',
        'GET /assignments/:id',
        'PATCH /assignments/:id/students/:studentId/status'
      ],
      mixed: [
        'PATCH /assignments/:id/students/:studentId/start',
        'POST /assignments/:id/students/:studentId/answers',
        'GET /assignments/:id/students/:studentId/current-set',
        'GET /students/:studentId/assignments'
      ]
    }
  });
});

// =================
// Error Handling Middleware สำหรับ Assignment Routes
// =================

/**
 * Middleware สำหรับจัดการ error ที่เกิดขึ้นใน assignment routes
 */
router.use((err: any, req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  console.error('Assignment router error:', err);
  
  // MongoDB validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e: any) => e.message);
    return res.status(400).json({ 
      message: 'ข้อมูลไม่ถูกต้อง', 
      errors 
    });
  }
  
  // MongoDB duplicate key error
  if (err.code === 11000) {
    return res.status(400).json({ 
      message: 'มีข้อมูลซ้ำในระบบ' 
    });
  }
  
  // Cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ 
      message: 'รูปแบบ ID ไม่ถูกต้อง' 
    });
  }
  
  // Default error
  res.status(500).json({ 
    message: 'เกิดข้อผิดพลาดในระบบ Assignment' 
  });
});

export default router;
