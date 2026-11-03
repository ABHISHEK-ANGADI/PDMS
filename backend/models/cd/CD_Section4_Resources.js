import mongoose from "mongoose";

const AssessmentWeightSchema = new mongoose.Schema(
  {
    co: { type: String, default: "" },
    q1: { type: Number, default: 0 },
    hw: { type: Number, default: 0 },
    pbl: { type: Number, default: 0 },
    term1: { type: Number, default: 0 },
    term2: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

const OnlineResourceSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  { _id: false },
);

const ScheduleGridSchema = new mongoose.Schema(
  {
    weeks: { type: [String], default: () => ["0-4", "5-8", "9", "10-13", "14-16", "17", "18-20", "21-26"] },
    rows: {
      quiz: { type: [String], default: [] },
      assignment: { type: [String], default: [] },
      pbl: { type: [String], default: [] },
      term1: { type: [String], default: [] },
      term2: { type: [String], default: [] },
      makeup: { type: [String], default: [] },
    },
  },
  { _id: false },
);

const AttainmentTargetSchema = new mongoose.Schema(
  {
    co: { type: String, default: "" },
    aText: { type: String, default: "" },
    aTarget: { type: Number, default: 60 },
    aAttained: { type: Number, default: 0 },
    bPlusText: { type: String, default: "" },
    bPlusTarget: { type: Number, default: 60 },
    bPlusAttained: { type: Number, default: 0 },
    bText: { type: String, default: "" },
    bTarget: { type: Number, default: 60 },
    bAttained: { type: Number, default: 0 },
  },
  { _id: false },
);

const PerformanceRecordingSchema = new mongoose.Schema(
  {
    totalStudents: { type: Number, default: 0 },
    appearedStudents: { type: Number, default: 0 },
    passedStudents: { type: Number, default: 0 },
    classAverage: { type: Number, default: 0 },
    gradeDistribution: {
      O: { type: Number, default: 0 },
      Aplus: { type: Number, default: 0 },
      A: { type: Number, default: 0 },
      Bplus: { type: Number, default: 0 },
      B: { type: Number, default: 0 },
      C: { type: Number, default: 0 },
      D: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const FeedbackSchema = new mongoose.Schema(
  {
    co: { type: String, default: "" },
    feedback: { type: String, default: "" },
  },
  { _id: false },
);

const Section4Schema = new mongoose.Schema(
  {
    courseCode: { type: String, required: true, index: true },
    version: { type: String, required: true },

    resources: {
      textBooks: { type: [String], default: () => [] },
      references: { type: [String], default: () => [] },
      otherResources: { type: [String], default: () => [] },
    },

    onlineResources: { type: [OnlineResourceSchema], default: () => [] },

    // ── Assessment Weights ──
    assessmentWeight: { type: [AssessmentWeightSchema], default: () => [] },
    assessmentWeightHtml: { type: String, default: "" },

    // ── Schedule ──
    scheduleOfAssessments: { type: ScheduleGridSchema, default: () => ({}) },
    scheduleHtml: { type: String, default: "" },

    // ── Criteria ──
    passingCriterion: { type: String, default: "" },
    gradingCriterion: { type: String, default: "" },

    // ── Attainment Targets ──
    attainmentTargets: { type: [AttainmentTargetSchema], default: () => [] },
    attainmentTargetsHtml: { type: String, default: "" },

    // ── Performance Recording ──
    performanceRecording: { type: PerformanceRecordingSchema, default: () => ({}) },
    performanceRecordingHtml: { type: String, default: "" },

    // ── CAB & Mapping ──
    cabAnalysis: {
      analysisNotes: { type: String, default: "" },
    },
    coAttainmentMapping: { type: [[String]], default: () => [] },
    coAttainmentMappingHtml: { type: String, default: "" },

    // ── Feedback ──
    feedback: { type: [FeedbackSchema], default: () => [] },
    feedbackHtml: { type: String, default: "" },

    // ── Other Details ──
    otherDetails: {
      assignmentDetails: { type: String, default: "" },
      academicIntegrity: { type: String, default: "" },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Creater", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    isApproved: { type: Boolean, default: false },
  },
  { timestamps: true },
);

Section4Schema.index({ courseCode: 1, version: 1 }, { unique: true });

export default mongoose.model("CD_Section4_Resources", Section4Schema);