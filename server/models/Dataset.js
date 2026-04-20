const mongoose = require('mongoose');

const dataRowSchema = new mongoose.Schema({
  geneName: String,
  organism: String,
  resistanceType: String,
  proteinLength: Number,
  function: String,
  aiExplainGene: String,
  aiExplainOrganism: String
});

const datasetSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filename: String,
  uploadDate: {
    type: Date,
    default: Date.now
  },
  data: [dataRowSchema],
  analysis: {
    totalGenes: Number,
    frequentResistance: String,
    frequentOrganism: String,
    avgProteinLength: Number,
    resistanceDistribution: mongoose.Schema.Types.Mixed, // Object mapping type -> count
    organismDistribution: mongoose.Schema.Types.Mixed, // Object mapping organism -> count
    proteinLengthDistribution: mongoose.Schema.Types.Mixed // Object mapping range -> count
  },
  aiSummary: String // Dataset level AI explanation
}, { timestamps: true });

module.exports = mongoose.model('Dataset', datasetSchema);
