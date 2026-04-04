import type { Request, Response } from 'express';
import User, { UserRole, UserStatus } from '../models/User.js';
import BlacklistedToken from '../models/BlacklistedToken.js';
import { JWT_SECRET, ALLOWED_USERNAME } from '../config/env.js';
import type { AuthRequest } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

/**
 * สมัครสมาชิกสำหรับ Student (ต้องรอการอนุมัติจาก Admin)
 */
export const registerStudent = async (req: Request, res: Response) => {
  try {
    const { 
      username, 
      password, 
      firstName, 
      lastName, 
      nickname, 
      school, 
      purpose 
    } = req.body;

    // ตรวจสอบข้อมูลที่จำเป็น
    if (!username || !password || !firstName || !lastName || !school || !purpose) {
      return res.status(400).json({ 
        message: 'กรุณากรอกข้อมูลให้ครบถ้วน (username, password, firstName, lastName, school, purpose)' 
      });
    }

    // ตรวจสอบว่า username ซ้ำหรือไม่
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'Username นี้ถูกใช้งานแล้ว' });
    }

    // สร้าง user ใหม่แบบ student (สถานะ pending)
    const user = new User({
      username: username.toLowerCase(),
      password,
      role: UserRole.STUDENT,
      status: UserStatus.PENDING,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nickname: nickname?.trim(),
      school: school.trim(),
      purpose: purpose.trim()
    });

    await user.save();

    return res.status(201).json({ 
      message: 'สมัครสมาชิกเรียบร้อย กรุณารอการอนุมัติจากผู้ดูแลระบบ',
      user: {
        id: user._id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Register student error:', error);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
  }
};

/**
 * สมัครสมาชิกสำหรับ Admin (เฉพาะ username ที่กำหนด)
 */
export const registerAdmin = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // ตรวจสอบว่าเป็น username ที่อนุญาต
    if (username !== ALLOWED_USERNAME) {
      return res.status(403).json({ message: 'ไม่อนุญาตให้สมัครสมาชิกด้วย username นี้' });
    }

    // ตรวจสอบว่ามี admin อยู่แล้วหรือไม่
    const existingAdmin = await User.findOne({ role: UserRole.ADMIN });
    if (existingAdmin) {
      return res.status(400).json({ message: 'มี Admin ในระบบแล้ว' });
    }

    const user = new User({
      username,
      password,
      role: UserRole.ADMIN,
      status: UserStatus.APPROVED // Admin อนุมัติทันที
    });

    await user.save();
    return res.status(201).json({ message: 'สร้างบัญชี Admin เรียบร้อย' });
  } catch (error) {
    console.error('Register admin error:', error);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
  }
};

/**
 * เข้าสู่ระบบ
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'กรุณากรอก username และ password' });
    }

    // ค้นหา user
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    // ตรวจสอบ password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    // ตรวจสอบสถานะของ user
    if (user.status === UserStatus.PENDING) {
      return res.status(403).json({ 
        message: 'บัญชีของคุณยังไม่ได้รับการอนุมัติ กรุณารอการอนุมัติจากผู้ดูแลระบบ',
        status: 'pending'
      });
    }

    if (user.status === UserStatus.REJECTED) {
      const reason = user.rejectionReason || 'ไม่ระบุเหตุผล';
      return res.status(403).json({ 
        message: `บัญชีของคุณถูกปฏิเสธ เหตุผล: ${reason}`,
        status: 'rejected'
      });
    }

    // สร้าง JWT token
    const tokenPayload = {
      id: user._id,
      username: user.username,
      role: user.role,
      status: user.status
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    return res.json({
      message: 'เข้าสู่ระบบสำเร็จ',
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        status: user.status,
        firstName: user.firstName,
        lastName: user.lastName,
        nickname: user.nickname,
        school: user.school
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
  }
};

/**
 * ดูข้อมูลโปรไฟล์ตนเอง
 */
export const profile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'ไม่พบข้อมูล User' });
    }

    return res.json({
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Profile error:', error);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
  }
};

/**
 * ออกจากระบบ (เพิ่ม token เข้า blacklist)
 */
export const logout = async (req: AuthRequest, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'ไม่พบ Token' });
    }

    const token = authHeader.split(' ')[1];
    
    // เพิ่ม token เข้า blacklist
    await BlacklistedToken.create({ token });
    console.log('Token blacklisted successfully:', token.substring(0, 20) + '...');

    return res.json({ message: 'ออกจากระบบเรียบร้อย' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการออกจากระบบ' });
  }
};

/**
 * ดูรายการ Student ที่รอการอนุมัติ (เฉพาะ Admin)
 */
export const getPendingStudents = async (req: AuthRequest, res: Response) => {
  try {
    // ตรวจสอบสิทธิ์ Admin
    if (req.user?.role !== UserRole.ADMIN) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });
    }

    const pendingStudents = await User.find({
      role: UserRole.STUDENT,
      status: UserStatus.PENDING
    })
    .select('-password')
    .sort({ createdAt: -1 });

    return res.json({
      students: pendingStudents.map(student => student.getPublicProfile()),
      total: pendingStudents.length
    });
  } catch (error) {
    console.error('Get pending students error:', error);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
  }
};

/**
 * อนุมัติ Student (เฉพาะ Admin)
 */
export const approveStudent = async (req: AuthRequest, res: Response) => {
  try {
    console.log('🔍 Approve student request:', {
      user: req.user,
      studentId: req.params.studentId,
      userRole: req.user?.role,
      userStatus: req.user?.status
    });

    // ตรวจสอบสิทธิ์ Admin
    if (req.user?.role !== UserRole.ADMIN) {
      console.log('❌ Access denied - not admin');
      return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });
    }

    const { studentId } = req.params;

    // ตรวจสอบ ObjectId
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      console.log('❌ Invalid student ID:', studentId);
      return res.status(400).json({ message: 'Student ID ไม่ถูกต้อง' });
    }

    const student = await User.findById(studentId);
    if (!student) {
      console.log('❌ Student not found:', studentId);
      return res.status(404).json({ message: 'ไม่พบ Student ที่ระบุ' });
    }

    console.log('🔍 Found student:', {
      id: student._id,
      username: student.username,
      role: student.role,
      status: student.status
    });

    if (student.role !== UserRole.STUDENT) {
      console.log('❌ User is not a student');
      return res.status(400).json({ message: 'User นี้ไม่ใช่ Student' });
    }

    if (student.status !== UserStatus.PENDING) {
      console.log('❌ Student is not pending');
      return res.status(400).json({ message: 'Student นี้ไม่ได้อยู่ในสถานะรอการอนุมัติ' });
    }

    // อนุมัติ Student
    student.status = UserStatus.APPROVED;
    student.approvedBy = new mongoose.Types.ObjectId(req.user.id);
    student.approvedAt = new Date();
    await student.save();

    console.log('✅ Student approved successfully:', student._id);

    return res.json({
      message: 'อนุมัติ Student เรียบร้อย',
      student: student.getPublicProfile()
    });
  } catch (error) {
    console.error('Approve student error:', error);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
  }
};

/**
 * ปฏิเสธ Student (เฉพาะ Admin)
 */
export const rejectStudent = async (req: AuthRequest, res: Response) => {
  try {
    // ตรวจสอบสิทธิ์ Admin
    if (req.user?.role !== UserRole.ADMIN) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });
    }

    const { studentId } = req.params;
    const { reason } = req.body;

    // ตรวจสอบ ObjectId
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'Student ID ไม่ถูกต้อง' });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'ไม่พบ Student ที่ระบุ' });
    }

    if (student.role !== UserRole.STUDENT) {
      return res.status(400).json({ message: 'User นี้ไม่ใช่ Student' });
    }

    if (student.status !== UserStatus.PENDING) {
      return res.status(400).json({ message: 'Student นี้ไม่ได้อยู่ในสถานะรอการอนุมัติ' });
    }

    // ปฏิเสธ Student
    student.status = UserStatus.REJECTED;
    student.rejectedAt = new Date();
    student.rejectionReason = reason || 'ไม่ระบุเหตุผล';
    await student.save();

    return res.json({
      message: 'ปฏิเสธ Student เรียบร้อย',
      student: student.getPublicProfile()
    });
  } catch (error) {
    console.error('Reject student error:', error);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
  }
};

/**
 * ดูรายการ Student ทั้งหมด (เฉพาะ Admin)
 */
export const getAllStudents = async (req: AuthRequest, res: Response) => {
  try {
    // ตรวจสอบสิทธิ์ Admin
    if (req.user?.role !== UserRole.ADMIN) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });
    }

    const { status, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    // สร้าง filter
    const filter: any = { role: UserRole.STUDENT };
    if (status && Object.values(UserStatus).includes(status as UserStatus)) {
      filter.status = status;
    }

    // ดึงข้อมูล students พร้อม pagination
    const students = await User.find(filter)
      .select('-password')
      .populate('approvedBy', 'username')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await User.countDocuments(filter);

    return res.json({
      students: students.map(student => student.getPublicProfile()),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Get all students error:', error);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
  }
};