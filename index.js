const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

// --- Get Word Definition Function (Corrected) ---
exports.getWordDefinition = onCall({
  secrets: ["GEMINI_KEY"],
  enforceAppCheck: false
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be called while authenticated.");
  }
  
  // LAZY INITIALIZATION: Initialize the client inside the function.
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

  const word = request.data.word;
  if (!word || typeof word !== "string" || word.length > 50) {
    throw new HttpsError("invalid-argument", "The function must be called with a valid 'word' argument.");
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `For the word "${word}", provide a concise definition, a simple example sentence, and three plausible but incorrect definitions (distractors) for a multiple-choice quiz. Return the response as a JSON object with the keys: "meaning", "example", and "distractors" (an array of strings).`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    try {
      return JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("JSON parse failed:", cleanedText);
      throw new HttpsError("internal", "AI response was not valid JSON.");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new HttpsError("internal", "An error occurred while fetching the word definition.");
  }
});

exports.generateWeeklyReport = onCall({
  secrets: ["GEMINI_KEY"],
  enforceAppCheck: true // Keep this true for security
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be called while authenticated.");
  }

  const genAI = new GoogleGenerAIs(process.env.GEMINI_KEY);
  const db = admin.firestore();
  const userId = request.auth.uid;
  
  // 1. Get data from the last 7 days
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const mocksPromise = db.collection(`users/${userId}/mocks`).where('timestamp', '>=', oneWeekAgo).get();
  const errorsPromise = db.collection(`users/${userId}/errorLog`).where('timestamp', '>=', oneWeekAgo).get();
  const quantPromise = db.collection(`users/${userId}/quantPracticeLog`).where('timestamp', '>=', oneWeekAgo).get();
  
  const [mocksSnapshot, errorsSnapshot, quantSnapshot] = await Promise.all([mocksPromise, errorsPromise, quantPromise]);

  // 2. Summarize the data
  const weeklyData = {
    mocks: mocksSnapshot.docs.map(doc => doc.data()),
    errors: errorsSnapshot.docs.map(doc => doc.data()),
    quantSessions: quantSnapshot.docs.map(doc => doc.data()),
  };

  // Basic analysis to feed the AI
  const numMocks = weeklyData.mocks.length;
  const numErrors = weeklyData.errors.length;
  const errorTopics = weeklyData.errors.map(e => e.topic);
  const mostCommonErrorTopic = errorTopics.sort((a,b) => errorTopics.filter(v => v===a).length - errorTopics.filter(v => v===b).length).pop() || 'None';

  // 3. Create a detailed prompt for the AI
  const prompt = `
    You are an expert coach for the CAT exam. Analyze the following user data for the last week and provide a short, encouraging, and actionable report in markdown format. 
    The report should have three sections: a "Mocks" summary, a "Weakest Area" analysis, and a clear "Recommendation". 
    Be concise and focus on the most important insight.

    Data:
    - Mocks attempted this week: ${numMocks}
    - Mock details: ${JSON.stringify(weeklyData.mocks)}
    - Errors logged this week: ${numErrors}
    - Most common error topic: ${mostCommonErrorTopic}
    - All errors: ${JSON.stringify(weeklyData.errors)}
    - Quant sessions: ${JSON.stringify(weeklyData.quantSessions)}
  `;

  // 4. Call the AI and return the result
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const reportText = result.response.text();
    return { report: reportText };
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new HttpsError("internal", "Failed to generate AI report.");
  }
});