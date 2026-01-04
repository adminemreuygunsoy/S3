const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("API Key Length:", apiKey ? apiKey.length : 0); // Sadece uzunluğu kontrol edelim

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = "gemini-pro";

  try {
      console.log(`Testing ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Hello");
      console.log("Success:", result.response.text());
  } catch (error) {
      console.error("FULL ERROR DETAILS:");
      console.error(error);
  }
}

listModels();