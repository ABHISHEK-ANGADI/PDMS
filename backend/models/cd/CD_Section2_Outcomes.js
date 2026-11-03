import mongoose from "mongoose";

const CourseOutcomeSchema = new mongoose.Schema(
  {
    code: { type: String, default: "" },
    description: { type: String, default: "" },
    application: { type: String, default: "" },
    bloom: { type: String, default: "" },
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

const Section2Schema = new mongoose.Schema(
  {
    courseCode: { type: String, required: true, index: true },
    version: { type: String, required: true },

    aimsSummary: { type: String, default: "" },
    objectives: { type: String, default: "" },

    // Structured Data
    courseOutcomes: { type: [CourseOutcomeSchema], default: () => [] },
    
    outcomeMap: {
      matrix: { type: [[String]], default: () => [] },
    },

    // HTML Versions
    courseOutcomesHtml: { type: String, default: "" },
    outcomeMapHtml: { type: String, default: "" },

    onlineResources: { type: [OnlineResourceSchema], default: () => [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Creater", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    isApproved: { type: Boolean, default: false },
  },
  { timestamps: true },
);

Section2Schema.index({ courseCode: 1, version: 1 }, { unique: true });

export default mongoose.model("CD_Section2_Outcomes", Section2Schema);