const mongoose = require('mongoose');

const savedResultSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['dataset', 'gene', 'organism'],
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  datasetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dataset',
    default: null
  },
  isFavorite: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

savedResultSchema.index({ userId: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('SavedResult', savedResultSchema);
