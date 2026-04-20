const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const Dataset = require('../models/Dataset');
const auth = require('../middleware/authMiddleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const PREFERRED_MODEL_ORDER = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-pro'
];
let cachedModelNames = null;
let modelCacheAt = 0;
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

async function getAvailableModelNames() {
  const now = Date.now();
  if (cachedModelNames && now - modelCacheAt < MODEL_CACHE_TTL_MS) {
    return cachedModelNames;
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`);
  if (!response.ok) {
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
  const modelCandidates = await getAvailableModelNames();

  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result?.response?.text?.();
      if (text) {
        console.log(`[AI] Model success: ${modelName}`);
        return text;
      }
    } catch (error) {
      lastError = error;
      console.error(`[AI] Model failed (${modelName}):`, error.message);
    }
  }

  throw lastError || new Error('No compatible Gemini model available');
}

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Format data
    const formattedData = data.map(row => {
      const rawLen = row['Protein Length (aa)'] ?? row['Protein Length (AA)'] ?? row['Protein Length'] ?? row.proteinLength;
      const parsedLen = Number(rawLen);
      const validLen = !isNaN(parsedLen) && parsedLen > 0 ? parsedLen : 0;

      return {
        geneName: row['Gene Name'] || row.geneName || '',
        organism: row['Organism'] || row.organism || '',
        resistanceType: row['Resistance Type'] || row.resistanceType || '',
        proteinLength: validLen,
        function: row['Function'] || row.function || ''
      };
    });

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
    const proteinLengths = data
      .map(row => Number(row["Protein Length (aa)"]))
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

    res.json(dataset);
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
    const dataset = await Dataset.findOne({ _id: req.params.id, user: req.user.id });
    if (!dataset) return res.status(404).json({ error: 'Not found' });
    res.json(dataset);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// AI Dataset Summary
router.post('/ai/dataset/:id', auth, async (req, res) => {
  try {
    console.log('[AI][dataset] Incoming body:', req.body);
    if (!genAI) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }

    const dataset = await Dataset.findOne({ _id: req.params.id, user: req.user.id });
    if (!dataset) return res.status(404).json({ error: 'Not found' });

    if (dataset.aiSummary) return res.json({ summary: dataset.aiSummary });

    const datasetForAI = req.body?.dataset;
    if (!Array.isArray(datasetForAI)) {
      return res.status(400).json({ error: 'No dataset provided' });
    }
    if (datasetForAI.length === 0) {
      return res.status(400).json({ error: 'Empty dataset' });
    }
    console.log('[AI][dataset] Dataset size for AI:', datasetForAI.length);

    const prompt = `Analyze this antibiotic resistance dataset and explain:
- dominant resistance patterns
- organism distribution
- biological significance
Use simple academic language.

Data Analysis: 
Total Genes: ${dataset.analysis.totalGenes}
Frequent Resistance: ${dataset.analysis.frequentResistance}
Frequent Organism: ${dataset.analysis.frequentOrganism}`;

    const summary = await generateAIText(prompt);
    console.log('[AI][dataset] AI response preview:', summary.slice(0, 200));

    dataset.aiSummary = summary;
    await dataset.save();

    res.json({ summary });
  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ error: "AI processing failed" });
  }
});

// AI Organism Explain
router.post('/ai/organism/:id', auth, async (req, res) => {
  try {
    console.log('[AI][organism] Incoming body:', req.body);
    if (!genAI) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }

    const { organism, list } = req.body;
    if (!organism || !Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ error: 'Empty dataset' });
    }
    console.log('[AI][organism] Organism and list size:', organism, list.length);

    const prompt = `Organism: ${organism}
Resistance Types: ${list}

Explain:
- about the organism
- diseases caused
- resistance behavior
- why it appears in dataset`;

    const explanation = await generateAIText(prompt);
    console.log('[AI][organism] AI response preview:', explanation.slice(0, 200));
    res.json({ explanation });
  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ error: "AI processing failed", detail: err.message });
  }
});

// AI Gene Explain
router.post('/ai/gene/:id', auth, async (req, res) => {
  try {
    console.log('[AI][gene] Incoming body:', req.body);
    if (!genAI) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }

    const { gene, organism } = req.body;
    if (!gene || !organism) {
      return res.status(400).json({ error: 'Gene and organism are required' });
    }
    console.log('[AI][gene] Gene + organism:', gene, organism);

    const prompt = `Gene: ${gene}
Organism: ${organism}

Explain:
- gene function
- resistance mechanism
- biological importance`;

    const explanation = await generateAIText(prompt);
    console.log('[AI][gene] AI response preview:', explanation.slice(0, 200));
    res.json({ explanation });
  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ error: "AI processing failed", detail: err.message });
  }
});

module.exports = router;
