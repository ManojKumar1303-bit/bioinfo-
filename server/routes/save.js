const express = require('express');
const mongoose = require('mongoose');
const SavedResult = require('../models/SavedResult');
const auth = require('../middleware/authMiddleware');

const router = express.Router();
const VALID_TYPES = ['dataset', 'gene', 'organism'];

router.post('/', auth, async (req, res) => {
  try {
    const { type, name, content, datasetId } = req.body;

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid result type' });
    }
    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }

    const duplicate = await SavedResult.findOne({
      userId: req.user.id,
      type,
      name: String(name).trim(),
      content: String(content).trim(),
      datasetId: datasetId || null
    });

    if (duplicate) {
      return res.status(200).json({ message: 'Result already saved', result: duplicate });
    }

    const savedResult = new SavedResult({
      userId: req.user.id,
      type,
      name,
      content,
      datasetId: datasetId && mongoose.Types.ObjectId.isValid(datasetId) ? datasetId : null
    });

    await savedResult.save();
    return res.status(201).json({ message: 'Result saved successfully', result: savedResult });
  } catch (error) {
    return res.status(500).json({ error: 'Server error saving result' });
  }
});

router.get('/:type', auth, async (req, res) => {
  try {
    const { type } = req.params;

    let query = { userId: req.user.id };
    if (type !== 'all') {
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Invalid result type' });
      }
      query = { ...query, type };
    }

    const results = await SavedResult.find(query).sort({ createdAt: -1 });
    return res.json(results);
  } catch (error) {
    return res.status(500).json({ error: 'Server error fetching saved results' });
  }
});

router.patch('/favorite/:id', auth, async (req, res) => {
  try {
    const result = await SavedResult.findOne({ _id: req.params.id, userId: req.user.id });
    if (!result) {
      return res.status(404).json({ error: 'Saved result not found' });
    }

    result.isFavorite = !result.isFavorite;
    await result.save();

    return res.json({ message: 'Favorite status updated', result });
  } catch (error) {
    return res.status(500).json({ error: 'Server error updating favorite status' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await SavedResult.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!deleted) {
      return res.status(404).json({ error: 'Saved result not found' });
    }

    return res.json({ message: 'Saved result deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error deleting saved result' });
  }
});

module.exports = router;
