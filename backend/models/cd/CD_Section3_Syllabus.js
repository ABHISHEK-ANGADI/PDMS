import mongoose from "mongoose";

const TeachingPlanSchema = new mongoose.Schema(
  {
    number: { type: String, default: "" },
    unitNo: { type: String, default: "" },
    topic: { type: String, default: "" },
    teachingFocus: { type: String, default: "" },
    activity: { type: String, default: "" },
    cosCovered: { type: String, default: "" },
    hours: { type: Number, default: 0 },
  },
  { _id: false },
);

const Section3Schema = new mongoose.Schema(
  {
    courseCode: { type: String, required: true, index: true },
    version: { type: String, required: true },

    courseContent: { type: String, default: "" },

    // Structured Data
    teaching: { type: [TeachingPlanSchema], default: () => [] },
    
    // HTML Versions
    teachingHtml: { type: String, default: "" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Creater", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    isApproved: { type: Boolean, default: false },
  },
  { timestamps: true },
);

Section3Schema.index({ courseCode: 1, version: 1 }, { unique: true });

export default mongoose.model("CD_Section3_Syllabus", Section3Schema);