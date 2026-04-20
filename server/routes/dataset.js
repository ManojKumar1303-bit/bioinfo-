const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Dataset = require('../models/Dataset');
const auth = require('../middleware/authMiddleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
if (geminiApiKey) {
  console.log('[INIT] GEMINI_API_KEY loaded:', geminiApiKey.substring(0, 10) + '...(hidden)');
} else {
  console.warn('[INIT] GEMINI_API_KEY is NOT configured!');
}
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const PREFERRED_MODEL_ORDER = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash-8b'
];
let cachedModelNames = null;
let modelCacheAt = 0;
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

async function getAvailableModelNames() {
  const now = Date.now();
  if (cachedModelNames && now - modelCacheAt < MODEL_CACHE_TTL_MS) {
    return cachedModelNames;
  }

  if (!geminiApiKey || geminiApiKey.trim() === '') {
    throw new Error('GEMINI_API_KEY is not configured. Please set it in your .env file.');
  }

  console.log('[AI] Fetching available models from Google API...');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`);
  
  console.log('[AI] Google API Response Status:', response.status, response.statusText);
  
  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[AI] Google API Error Response:', errorBody);
    
    if (response.status === 403) {
      throw new Error('GEMINI_API_KEY is invalid or does not have required permissions. Please verify your API key in the Google Cloud Console and ensure the Generative Language API is enabled.');
    }
    throw new Error(`Model discovery failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const models = Array.isArray(payload?.models) ? payload.models : [];
  const modelNames = models
    .filter((model) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
    .map((model) => String(model.name || '').replace(/^models\//, ''))
    .filter(Boolean);

  if (modelNames.length === 0) {
    throw new Error('No generateContent models available for current API key/project');
  }

  const preferred = PREFERRED_MODEL_ORDER.filter((name) => modelNames.includes(name));
  const remaining = modelNames.filter((name) => !preferred.includes(name));
  cachedModelNames = [...preferred, ...remaining];
  modelCacheAt = now;

  console.log('[AI] Available model order:', cachedModelNames);
  return cachedModelNames;
}

async function generateAIText(prompt) {
  let lastError = null;
  const AI_TIMEOUT_MS = 30000; // 30 second timeout per model attempt
  
  // Try to get available models, but fall back to default if discovery fails
  let modelCandidates = PREFERRED_MODEL_ORDER;
  
  try {
    modelCandidates = await getAvailableModelNames();
  } catch (error) {
    console.warn('[AI] Model discovery failed, using preferred order as fallback:', error.message);
    // Continue with preferred models anyway
  }

  for (const modelName of modelCandidates) {
    try {
      console.log(`[AI] Attempting model: ${modelName}`);
      
      const model = genAI.getGenerativeModel({ model: modelName });
      
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`AI request timeout after ${AI_TIMEOUT_MS}ms`)), AI_TIMEOUT_MS)
      );
      
      // Race between AI call and timeout
      const result = await Promise.race([
        model.generateContent(prompt),
        timeoutPromise
      ]);
      
      // Get text from response
      const text = result?.response?.text?.();
      
      if (text && text.trim()) {
        console.log(`[AI] ✓ Model success: ${modelName}`);
        return text;
      }
    } catch (error) {
      lastError = error;
      console.error(`[AI] ✗ Model failed (${modelName}):`, error.message);
    }
  }

  throw lastError || new Error('No compatible Gemini model available');
}

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, {
      defval: '',
      raw: false
    });
    console.log('Total rows parsed:', data.length);

    const normalizeKey = (key) => String(key || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    const getValue = (row, keys) => {
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
          return row[key];
        }
      }

      const normalizedRow = {};
      Object.keys(row || {}).forEach((k) => {
        normalizedRow[normalizeKey(k)] = row[k];
      });

      for (const key of keys) {
        const normalizedMatch = normalizedRow[normalizeKey(key)];
        if (normalizedMatch !== undefined) return normalizedMatch;
      }

      return '';
    };

    // Format data
    const formattedData = data.map(row => {
      const rawLen = getValue(row, [
        'Protein Length (aa)',
        'Protein Length (AA)',
        'Protein Length',
        'proteinLength',
        'Protein length (aa)'
      ]);
      const parsedLen = Number(rawLen);
      const validLen = !isNaN(parsedLen) && parsedLen > 0 ? parsedLen : 0;

      return {
        geneName: String(getValue(row, ['Gene Name', 'geneName'])).trim(),
        organism: String(getValue(row, ['Organism', 'organism'])).trim(),
        resistanceType: String(getValue(row, ['Resistance Type', 'resistanceType'])).trim(),
        proteinLength: validLen,
        function: String(getValue(row, ['Function', 'function'])).trim()
      };
    }).filter((row) =>
      row.geneName || row.organism || row.resistanceType || row.function || row.proteinLength > 0
    );

    console.log('Total rows formatted:', formattedData.length);

    // Compute analysis
    let totalGenes = formattedData.length;
    let resistanceDistribution = {};
    let organismDistribution = {};
    let proteinLengthDistribution = {
      '0-200': 0,
      '200-400': 0,
      '400-600': 0,
      '600+': 0
    };
    const proteinLengths = formattedData
      .map(row => Number(row.proteinLength))
      .filter(val => !isNaN(val) && val > 0);

    formattedData.forEach(row => {
      // Resistance distribution
      const resType = row.resistanceType;
      if (resType) resistanceDistribution[resType] = (resistanceDistribution[resType] || 0) + 1;
      
      // Organism distribution
      const org = row.organism;
      if (org) organismDistribution[org] = (organismDistribution[org] || 0) + 1;
      
      if (row.proteinLength > 0) {
        // Protein length distribution
        if (row.proteinLength <= 200) {
          proteinLengthDistribution['0-200']++;
        } else if (row.proteinLength <= 400) {
          proteinLengthDistribution['200-400']++;
        } else if (row.proteinLength <= 600) {
          proteinLengthDistribution['400-600']++;
        } else {
          proteinLengthDistribution['600+']++;
        }
      }
    });

    const frequentResistance = Object.keys(resistanceDistribution).reduce((a, b) => resistanceDistribution[a] > resistanceDistribution[b] ? a : b, '');
    const frequentOrganism = Object.keys(organismDistribution).reduce((a, b) => organismDistribution[a] > organismDistribution[b] ? a : b, '');
    
    const avgProteinLength = proteinLengths.length
      ? proteinLengths.reduce((a, b) => a + b, 0) / proteinLengths.length
      : 0;

    const dataset = new Dataset({
      user: req.user.id,
      filename: req.file.originalname,
      data: formattedData,
      analysis: {
        totalGenes,
        frequentResistance,
        frequentOrganism,
        avgProteinLength,
        resistanceDistribution,
        organismDistribution,
        proteinLengthDistribution
      }
    });

    await dataset.save();
    console.log('Total rows saved:', dataset.data.length);

    res.json({ data: dataset, totalRows: dataset.data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error parsing file' });
  }
});

router.get('/datasets', auth, async (req, res) => {
  try {
    const datasets = await Dataset.find({ user: req.user.id }).select('-data');
    res.json(datasets);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching datasets' });
  }
});

router.get('/dataset/:id', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid dataset id' });
    }

    const dataset = await Dataset.findOne({ _id: req.params.id, user: req.user.id });
    if (!dataset) return res.status(404).json({ error: 'Not found' });
    res.json({ data: dataset, totalRows: Array.isArray(dataset.data) ? dataset.data.length : 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// AI Dataset Summary
router.post('/ai/dataset/:id', auth, async (req, res) => {
  try {
    console.log('[AI][dataset] Request for dataset:', req.params.id);
    
    if (!genAI) {
      console.error('[AI] genAI not initialized - GEMINI_API_KEY may be missing');
      return res.status(500).json({ error: 'AI service not configured. Please check GEMINI_API_KEY.' });
    }

    const dataset = await Dataset.findOne({ _id: req.params.id, user: req.user.id });
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

    // Return cached summary if available
    if (dataset.aiSummary) {
      console.log('[AI][dataset] Returning cached summary');
      return res.json({ summary: dataset.aiSummary });
    }

    const datasetForAI = req.body?.dataset;
    if (!Array.isArray(datasetForAI) || datasetForAI.length === 0) {
      return res.status(400).json({ error: 'Dataset required for analysis' });
    }

    const prompt = `Analyze this antibiotic resistance dataset and explain:
- dominant resistance patterns
- organism distribution
- biological significance
Use simple academic language.

Data Analysis: 
Total Genes: ${dataset.analysis.totalGenes}
Frequent Resistance: ${dataset.analysis.frequentResistance}
Frequent Organism: ${dataset.analysis.frequentOrganism}`;

    console.log('[AI][dataset] Generating AI analysis...');
    const summary = await generateAIText(prompt);
    
    console.log('[AI][dataset] ✓ Analysis generated successfully');
    dataset.aiSummary = summary;
    await dataset.save();

    res.json({ summary });
  } catch (err) {
    console.error('[AI][dataset] ERROR:', err.message);
    
    const errorMessage = err.message.includes('timeout') 
      ? 'AI request timed out. Please try again.'
      : err.message.includes('No compatible')
      ? 'No AI models available. Check API key configuration.'
      : 'AI analysis failed. Please try again later.';
    
    res.status(500).json({ error: errorMessage });
  }
});

// AI Organism Explain
router.post('/ai/organism/:id', auth, async (req, res) => {
  try {
    console.log('[AI][organism] Request for organism analysis');
    
    if (!genAI) {
      console.error('[AI] genAI not initialized');
      return res.status(500).json({ error: 'AI service not configured.' });
    }

    const { organism, list } = req.body;
    if (!organism || !Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ error: 'Organism and resistance list required' });
    }

    const prompt = `Organism: ${organism}
Resistance Types: ${list.join(', ')}

Explain:
1. About the organism and its characteristics
2. Common diseases it causes
3. Resistance behavior in clinical settings
4. Why it appears in this dataset`;

    console.log('[AI][organism] Generating explanation for:', organism);
    const explanation = await generateAIText(prompt);
    
    console.log('[AI][organism] ✓ Explanation generated successfully');
    res.json({ explanation });
  } catch (err) {
    console.error('[AI][organism] ERROR:', err.message);
    
    const errorMessage = err.message.includes('timeout')
      ? 'AI request timed out. Please try again.'
      : 'Failed to generate organism explanation. Please try again.';
    
    res.status(500).json({ error: errorMessage });
  }
});

// AI Gene Explain
router.post('/ai/gene/:id', auth, async (req, res) => {
  try {
    console.log('[AI][gene] Request for gene analysis');
    
    if (!genAI) {
      console.error('[AI] genAI not initialized');
      return res.status(500).json({ error: 'AI service not configured.' });
    }

    const { gene, organism } = req.body;
    if (!gene || !organism) {
      return res.status(400).json({ error: 'Gene and organism are required' });
    }

    const prompt = `Gene: ${gene}
Organism: ${organism}

Explain:
1. What is the function of this gene
2. How it confers resistance
3. Its biological importance
4. Clinical relevance`;

    console.log('[AI][gene] Generating explanation for gene:', gene);
    const explanation = await generateAIText(prompt);
    
    console.log('[AI][gene] ✓ Explanation generated successfully');
    res.json({ explanation });
  } catch (err) {
    console.error('[AI][gene] ERROR:', err.message);
    
    const errorMessage = err.message.includes('timeout')
      ? 'AI request timed out. Please try again.'
      : 'Failed to generate gene explanation. Please try again.';
    
    res.status(500).json({ error: errorMessage });
  }
});

module.exports = router;
