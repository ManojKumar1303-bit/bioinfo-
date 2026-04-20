const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
const authRoutes = require('./routes/auth');
const datasetRoutes = require('./routes/dataset');
const saveRoutes = require('./routes/save');

app.use('/auth', authRoutes);
app.use('/api', datasetRoutes);
app.use('/api/save', saveRoutes);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bioinfo';

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB Connected');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    console.error('Using URI:', MONGO_URI);
    console.error('If using local MongoDB, ensure the MongoDB service is running on port 27017.');
    process.exit(1);
  }
}

startServer();
