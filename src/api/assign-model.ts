import mongoose, { Document, Schema } from 'mongoose';

// กำหนด enum สำหรับสถานะของการทำงาน
export enum AssignmentStatus {
  TODO = 'todo',
  INPROGRESS = 'inprogress', 
  COMPLETE = 'complete',
  DONE = 'done'
}

// Interface สำหรับคำตอบของนักเรียน
export interface IAnswer {
  questionNumber: number;
  questionText: string;
  answerText: string;
  answeredAt: Date;
  timeTaken?: number;   // seconds taken to answer this question
  score?: number;       // score awarded for this answer
  listPosLock?: ILockedPos[];
  slotTypes?: string[] | null; // slot type per board position (px1/px2/px3/ex2/ex3) — snapshot at submit time
}

export interface ILockedPos {
  pos: number;    // index ใน answer slots (0-based)
  value: string;  // token ที่ lock อยู่ตำแหน่งนั้น
}

// Interface สำหรับข้อมูลนักเรียนในงาน
export interface IStudentAssignment {
  studentId: mongoose.Types.ObjectId;
  status: AssignmentStatus;
  startedAt?: Date;
  completedAt?: Date;
  markedDoneAt?: Date;
  answers: IAnswer[];
  currentQuestionSet: number; // Track which option set student is currently on
  questionsCompletedInCurrentSet: number; // Track progress within current set
  currentQuestionElements?: string[] | null; // Persist generated tokens for current question (rack tiles)
  currentQuestionSolutionTokens?: string[] | null; // Persist solution tokens (answer) for lock pos reference
  currentQuestionListPosLock?: ILockedPos[] | null;
  currentQuestionSlotTypes?: string[] | null; // Persist slot types (px1/px2/px3/ex2/ex3) for each board slot
}

// New interface for option sets
export interface IOptionSet {
  options: {
    totalCount: number;
    operatorMode: 'random' | 'specific';
    operatorCount: number;
    specificOperators?: {
      plus?: number;
      minus?: number;
      multiply?: number;
      divide?: number;
    };
    equalsCount: number;
    heavyNumberCount: number;
    BlankCount: number;
    zeroCount: number;
    operatorCounts?: {
      '+': number;
      '-': number;
      '×': number;
      '÷': number;
    };
    operatorFixed?: {
      '+': number|null;
      '-': number|null;
      '×': number|null;
      '÷': number|null;
      '+/-': number|null;
      '×/÷': number|null;
    };
    equalsMode?: 'random' | 'specific';
    equalsMin?: number;
    equalsMax?: number;
    heavyNumberMode?: 'random' | 'specific';
    heavyNumberMin?: number;
    heavyNumberMax?: number;
    blankMode?: 'random' | 'specific';
    blankMin?: number;
    blankMax?: number;
    zeroMode?: 'random' | 'specific';
    zeroMin?: number;
    zeroMax?: number;
    operatorMin?: number;
    operatorMax?: number;
    randomSettings?: {
      operators: boolean;
      equals: boolean;
      heavy: boolean;
      blank: boolean;
      zero: boolean;
    };
    isLockPos?: boolean;
  };
  numQuestions: number;
  setLabel?: string; // Optional label like "8tile", "9tile"
}

// Interface สำหรับ Assignment Document
export interface IAssignment extends Document {
  title: string;
  description: string;
  totalQuestions: number;
  timeLimitSeconds?: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  dueDate: Date;
  students: IStudentAssignment[];
  optionSets: IOptionSet[]; // Array of option sets for progression
  
  // Methods
  getAssignmentWithProgress(): object;
  getStudentProgress(studentId: string): IStudentAssignment | null;
  getNextQuestionSet(studentId: string): { optionSet: IOptionSet | null; currentSetIndex: number; questionsCompleted: number };
  shouldProgressToNextSet(studentId: string): boolean;
}

const LockedPosSchema = new Schema<ILockedPos>(
  {
    pos: { type: Number, required: true, min: 0 },
    value: { type: String, required: true, trim: true }
  },
  { _id: false }
);

// Schema สำหรับคำตอบ
const AnswerSchema = new Schema<IAnswer>({
  questionNumber: { 
    type: Number, 
    required: true,
    min: 1
  },
  questionText: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 1000
  },
  answerText: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 2000
  },
  answeredAt: {
    type: Date,
    default: Date.now
  },
  timeTaken: { type: Number, min: 0 },
  score: { type: Number, min: 0 },
  listPosLock: { type: [LockedPosSchema], default: undefined },
  slotTypes: { type: [String], default: undefined }
}, { _id: false });

// Schema สำหรับข้อมูลนักเรียนในงาน
const StudentAssignmentSchema = new Schema<IStudentAssignment>({
  studentId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  status: { 
    type: String, 
    enum: Object.values(AssignmentStatus),
    default: AssignmentStatus.TODO
  },
  startedAt: Date,
  completedAt: Date,
  markedDoneAt: Date,
  answers: [AnswerSchema],
  currentQuestionSet: { type: Number, default: 0 }, // Index of current option set
  questionsCompletedInCurrentSet: { type: Number, default: 0 }, // Questions completed in current set
  currentQuestionElements: { type: [String], default: null },
  currentQuestionSolutionTokens: { type: [String], default: null },
  currentQuestionListPosLock: { type: [LockedPosSchema], default: null },
  currentQuestionSlotTypes: { type: [String], default: null }
}, { _id: false });

// Schema สำหรับ Option Set
const OptionSetSchema = new Schema<IOptionSet>({
  options: {
    totalCount: { type: Number, required: true },
    operatorMode: { type: String, enum: ['random', 'specific'], required: true },
    operatorCount: { type: Number, required: true },
    specificOperators: {
      plus: Number,
      minus: Number,
      multiply: Number,
      divide: Number
    },
    equalsCount: { type: Number, required: true },
    heavyNumberCount: { type: Number, required: true },
    BlankCount: { type: Number, required: true },
    zeroCount: { type: Number, required: true },
    operatorCounts: {
      '+': Number,
      '-': Number,
      '×': Number,
      '÷': Number
    },
    operatorFixed: {
      '+': { type: Number, default: null },
      '-': { type: Number, default: null },
      '×': { type: Number, default: null },
      '÷': { type: Number, default: null },
      '+/-': { type: Number, default: null },
      '×/÷': { type: Number, default: null }
    },
    equalsMode: { type: String, enum: ['random', 'specific'] },
    equalsMin: Number,
    equalsMax: Number,
    heavyNumberMode: { type: String, enum: ['random', 'specific'] },
    heavyNumberMin: Number,
    heavyNumberMax: Number,
    blankMode: { type: String, enum: ['random', 'specific'] },
    blankMin: Number,
    blankMax: Number,
    zeroMode: { type: String, enum: ['random', 'specific'] },
    zeroMin: Number,
    zeroMax: Number,
    operatorMin: Number,
    operatorMax: Number,
    randomSettings: {
      operators: { type: Boolean, default: false },
      equals: { type: Boolean, default: false },
      heavy: { type: Boolean, default: false },
      blank: { type: Boolean, default: false },
      zero: { type: Boolean, default: false }
    },
    isLockPos: { type: Boolean, default: false }
  },
  numQuestions: { type: Number, required: true },
  setLabel: { type: String }
}, { _id: false });

// Schema หลักสำหรับ Assignment
const AssignmentSchema = new Schema<IAssignment>({
  title: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  description: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 1000
  },
  totalQuestions: { 
    type: Number, 
    required: true,
    min: 1,
    max: 100
  },
  createdBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  dueDate: {
    type: Date,
    required: true
  },
  timeLimitSeconds: {
    type: Number,
    min: 1,
    default: null
  },
  students: [StudentAssignmentSchema],
  optionSets: [OptionSetSchema] // Array of option sets
}, { 
  timestamps: true 
});

// Index สำหรับการค้นหา
AssignmentSchema.index({ createdBy: 1, createdAt: -1 });
AssignmentSchema.index({ 'students.studentId': 1 });
AssignmentSchema.index({ dueDate: 1 });
AssignmentSchema.index({ createdAt: -1 });

// Pre-save middleware สำหรับการตรวจสอบข้อมูล
AssignmentSchema.pre('save', function (next) {
  // ตรวจสอบว่า dueDate ไม่เป็นอดีต (เฉพาะเมื่อสร้างใหม่)
  if (this.isNew && this.dueDate < new Date()) {
    return next(new Error('วันครบกำหนดต้องไม่เป็นวันที่ในอดีต'));
  }
  
  // ตรวจสอบว่าไม่มีนักเรียนซ้ำ
  const studentIds = this.students.map(s => s.studentId.toString());
  const uniqueIds = [...new Set(studentIds)];
  if (studentIds.length !== uniqueIds.length) {
    return next(new Error('ไม่สามารถมอบหมายงานให้นักเรียนคนเดียวกันซ้ำได้'));
  }
  
  next();
});

// Method สำหรับดึงข้อมูลงานพร้อมความคืบหน้า
AssignmentSchema.methods.getAssignmentWithProgress = function(): object {
  const assignment = this.toObject();
  
  // คำนวณสถิติ
  const totalStudents = assignment.students.length;
  const todoCount = assignment.students.filter((s: IStudentAssignment) => s.status === AssignmentStatus.TODO).length;
  const inProgressCount = assignment.students.filter((s: IStudentAssignment) => s.status === AssignmentStatus.INPROGRESS).length;
  const completeCount = assignment.students.filter((s: IStudentAssignment) => s.status === AssignmentStatus.COMPLETE).length;
  const doneCount = assignment.students.filter((s: IStudentAssignment) => s.status === AssignmentStatus.DONE).length;
  
  // เพิ่มข้อมูลความคืบหน้าให้แต่ละนักเรียน
  assignment.students = assignment.students.map((student: IStudentAssignment) => {
    // Handle studentId field - if it's populated, extract only the id
    let studentId: any = student.studentId;
    if (studentId && typeof studentId === 'object' && studentId._id) {
      studentId = studentId._id.toString();
    } else if (studentId && typeof studentId === 'object' && studentId.id) {
      studentId = studentId.id;
    }
    
    return {
      ...student,
      studentId: studentId,
      progressPercentage: Math.round((student.answers.length / assignment.totalQuestions) * 100),
      answeredQuestions: student.answers.length,
      remainingQuestions: assignment.totalQuestions - student.answers.length
    };
  });
  
  // Transform _id to id
  if (assignment._id) {
    assignment.id = assignment._id.toString();
    delete assignment._id;
  }
  
  return {
    ...assignment,
    statistics: {
      totalStudents,
      statusBreakdown: {
        todo: todoCount,
        inprogress: inProgressCount, 
        complete: completeCount,
        done: doneCount
      },
      completionRate: totalStudents > 0 ? Math.round(((completeCount + doneCount) / totalStudents) * 100) : 0
    }
  };
};

// Method สำหรับดึงความคืบหน้าของนักเรียนคนใดคนหนึ่ง
AssignmentSchema.methods.getStudentProgress = function(studentId: string): IStudentAssignment | null {
  const student = this.students.find((s: IStudentAssignment) => 
    s.studentId.toString() === studentId
  );
  
  if (!student) return null;
  
  return {
    ...student.toObject(),
    progressPercentage: Math.round((student.answers.length / this.totalQuestions) * 100),
    answeredQuestions: student.answers.length,
    remainingQuestions: this.totalQuestions - student.answers.length
  };
};

// Method to get next question set for a student
AssignmentSchema.methods.getNextQuestionSet = function(studentId: string) {
  const student = this.students.find((s: IStudentAssignment) => s.studentId.toString() === studentId);
  if (!student || !this.optionSets || this.optionSets.length === 0) {
    return { optionSet: null, currentSetIndex: -1, questionsCompleted: 0 };
  }

  const currentSetIndex = student.currentQuestionSet;
  const questionsCompleted = student.questionsCompletedInCurrentSet;
  
  // If student hasn't started or has completed current set
  if (currentSetIndex >= this.optionSets.length) {
    return { optionSet: null, currentSetIndex: -1, questionsCompleted: 0 };
  }

  const currentOptionSet = this.optionSets[currentSetIndex];
  return { 
    optionSet: currentOptionSet, 
    currentSetIndex, 
    questionsCompleted 
  };
};

// Method to check if student should progress to next set
AssignmentSchema.methods.shouldProgressToNextSet = function(studentId: string) {
  const student = this.students.find((s: IStudentAssignment) => s.studentId.toString() === studentId);
  if (!student || !this.optionSets || this.optionSets.length === 0) {
    return false;
  }

  const currentSetIndex = student.currentQuestionSet;
  if (currentSetIndex >= this.optionSets.length) {
    return false; // Already completed all sets
  }

  const currentSet = this.optionSets[currentSetIndex];
  return student.questionsCompletedInCurrentSet >= currentSet.numQuestions;
};

// Helper method to calculate progress percentage
AssignmentSchema.methods.calculateProgressPercentage = function(student: IStudentAssignment) {
  if (this.totalQuestions === 0) return 0;
  return Math.round((student.answers.length / this.totalQuestions) * 100);
};

// Virtual สำหรับตรวจสอบว่าหมดเวลาแล้วหรือไม่
AssignmentSchema.virtual('isOverdue').get(function(this: IAssignment) {
  return new Date() > this.dueDate;
});

// Virtual สำหรับคำนวณเวลาที่เหลือ
AssignmentSchema.virtual('timeRemaining').get(function(this: IAssignment) {
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffMs = due.getTime() - now.getTime();
  
  if (diffMs <= 0) return null;
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  return { days, hours, totalHours: Math.floor(diffMs / (1000 * 60 * 60)) };
});

// Ensure virtual fields are serialized
AssignmentSchema.set('toJSON', { virtuals: true });

export default mongoose.model<IAssignment>('Assignment', AssignmentSchema);
