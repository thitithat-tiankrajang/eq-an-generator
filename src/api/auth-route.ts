import express from 'express';
const { Router } = express;
import { 
  registerStudent,
  registerAdmin, 
  login, 
  profile, 
  logout,
  getPendingStudents,
  approveStudent,
  rejectStudent,
  getAllStudents
} from '../controllers/auth.js';
import { 
  authMiddleware, 
  requireAdmin, 
  requireApprovedStudent,
  requireApprovedUser,
  type AuthRequest
} from '../middleware/auth.js';

const router = Router();

// =================
// Public Routes (ไม่ต้อง login)
// =================

/**
 * POST /auth/register/student
 * สมัครสมาชิกสำหรับ Student
 * Body: { username, password, firstName, lastName, nickname?, school, purpose }
 */
router.post('/register/student', registerStudent);

/**
 * POST /auth/register/admin  
 * สมัครสมาชิกสำหรับ Admin (เฉพาะ username ที่กำหนด)
 * Body: { username, password }
 */
router.post('/register/admin', registerAdmin);

/**
 * POST /auth/login
 * เข้าสู่ระบบ
 * Body: { username, password }
 */
router.post('/login', login);

// =================
// Protected Routes (ต้อง login)
// =================

/**
 * GET /auth/profile
 * ดูข้อมูลโปรไฟล์ตนเอง
 * Headers: Authorization: Bearer <token>
 */
router.get('/profile', authMiddleware, profile);

/**
 * POST /auth/logout
 * ออกจากระบบ (เพิ่ม token เข้า blacklist)
 * Headers: Authorization: Bearer <token>
 */
router.post('/logout', authMiddleware, logout);

// =================
// Admin Only Routes
// =================

/**
 * GET /auth/admin/students/pending
 * ดูรายการ Student ที่รอการอนุมัติ (เฉพาะ Admin)
 * Headers: Authorization: Bearer <token>
 */
router.get('/admin/students/pending', authMiddleware, requireAdmin, getPendingStudents);

/**
 * GET /auth/admin/students
 * ดูรายการ Student ทั้งหมด (เฉพาะ Admin)
 * Query: ?status=pending|approved|rejected&page=1&limit=10
 * Headers: Authorization: Bearer <token>
 */
router.get('/admin/students', authMiddleware, requireAdmin, getAllStudents);

/**
 * PUT /auth/admin/students/:studentId/approve
 * อนุมัติ Student (เฉพาะ Admin)
 * Headers: Authorization: Bearer <token>
 */
router.put('/admin/students/:studentId/approve', authMiddleware, requireAdmin, approveStudent);

/**
 * PUT /auth/admin/students/:studentId/reject
 * ปฏิเสธ Student (เฉพาะ Admin)
 * Body: { reason?: string }
 * Headers: Authorization: Bearer <token>
 */
router.put('/admin/students/:studentId/reject', authMiddleware, requireAdmin, rejectStudent);

// =================
// Student Only Routes
// =================

/**
 * GET /auth/student/dashboard
 * Dashboard สำหรับ Student ที่ได้รับการอนุมัติ
 * Headers: Authorization: Bearer <token>
 */
router.get('/student/dashboard', authMiddleware, requireApprovedStudent, (req: AuthRequest, res) => {
  res.json({
    message: 'ยินดีต้อนรับเข้าสู่ระบบ Student',
    user: req.user,
    features: [
      'ดูข้อมูลโปรไฟล์',
      'เข้าถึงเนื้อหาการเรียน',
      'ทำแบบทดสอบ',
      'ดูผลคะแนน'
    ]
  });
});

// =================
// Mixed Access Routes (Admin + Approved Student)
// =================

/**
 * GET /auth/dashboard
 * Dashboard หลักสำหรับ User ที่ได้รับอนุมัติ
 * Headers: Authorization: Bearer <token>
 */
router.get('/dashboard', authMiddleware, requireApprovedUser, (req: AuthRequest, res) => {
  const isAdmin = req.user?.role === 'admin';
  
  res.json({
    message: `ยินดีต้อนรับเข้าสู่ระบบ ${isAdmin ? 'Admin' : 'Student'}`,
    user: req.user,
    features: isAdmin ? [
      'จัดการ Student',
      'อนุมัติ/ปฏิเสธการสมัคร',
      'ดูสถิติระบบ',
      'จัดการเนื้อหา'
    ] : [
      'ดูข้อมูลโปรไฟล์',
      'เข้าถึงเนื้อหาการเรียน',
      'ทำแบบทดสอบ',
      'ดูผลคะแนน'
    ]
  });
});

// =================
// Health Check for Auth System
// =================

/**
 * GET /auth/health
 * ตรวจสอบสถานะของระบบ Auth
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Auth system is running',
    timestamp: new Date().toISOString(),
    features: {
      studentRegistration: true,
      adminManagement: true,
      tokenBlacklist: true,
      roleBasedAccess: true
    }
  });
});

export default router;