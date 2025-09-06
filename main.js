import './style.css';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';
import 'firebase/compat/app-check'; // Import App Check
import Chart from 'chart.js/auto';

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// --- VITE-SPECIFIC SETUP FOR EMULATORS & APP CHECK ---

// This block automatically handles setup for development vs. production
if (import.meta.env.MODE === 'development') {
  // 1. We are in development mode (npm run dev)
  console.log("Development mode: Enabling App Check debug mode.");

  // This line tells the SDK to generate and log a debug token to the console.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

  // Initialize App Check for debugging
  const appCheck = firebase.appCheck();
  appCheck.activate(
    'dummy-site-key-for-local-development', // The site key isn't used in debug mode, but the call is required.
    true
  );
  
  // Connect to local emulators
  const functions = firebase.app().functions("us-central1");
  functions.useEmulator("localhost", 5001);

} else {
  // 2. We are in production mode (after 'npm run build')
  // Initialize App Check for the live deployed app
  const appCheck = firebase.appCheck();
  appCheck.activate(
    import.meta.env.VITE_RECAPTCHA_SITE_KEY,
    true
  );
}


// --- START OF MAIN APP LOGIC ---
(() => {
    const auth = firebase.auth();
    const db = firebase.firestore();
    const functions = firebase.functions(); // This will now correctly use the emulator in dev mode

    // DOM Element References
    const navButtons = document.querySelectorAll('#desktop-nav button');
    const views = document.querySelectorAll('#main-content > div');
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.getElementById('app-container');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userEmailSpan = document.getElementById('user-email');
    const errorLogForm = document.getElementById('error-log-form');
    const errorLogTableBody = document.getElementById('error-log-table-body');
    const vocabForm = document.getElementById('vocab-form');
    const addWordBtn = document.getElementById('add-word-btn');
    const vocabResult = document.getElementById('vocab-result');
    const vocabListContainer = document.getElementById('vocabulary-list-container');
    const startQuizBtn = document.getElementById('start-quiz-btn');
    const quizContainer = document.getElementById('quiz-container');
    const quizStartContainer = document.getElementById('quiz-start-container');
    const quizScoreContainer = document.getElementById('quiz-score-container');
    const quizWord = document.getElementById('quiz-word');
    const quizOptions = document.getElementById('quiz-options');
    const quizFeedback = document.getElementById('quiz-feedback');
    const quizFinalScore = document.getElementById('quiz-final-score');
    const restartQuizBtn = document.getElementById('restart-quiz-btn');
    const mockForm = document.getElementById('mock-form');
    const mockListContainer = document.getElementById('mock-list-container');
    const overallChartContainer = document.getElementById('overall-chart-container');
    const sectionalChartContainer = document.getElementById('sectional-chart-container');
    const toastContainer = document.getElementById('toast-container');
    const quantPracticeForm = document.getElementById('quant-practice-form');
    const quantLogContainer = document.getElementById('quant-log-container');
    const dilrSetForm = document.getElementById('dilr-set-form');
    const dilrLogContainer = document.getElementById('dilr-log-container');
    const varcReadingForm = document.getElementById('varc-reading-form');
    const varcReadingLogContainer = document.getElementById('varc-reading-log-container');
    const varcPracticeForm = document.getElementById('varc-practice-form');
    const varcPracticeLogContainer = document.getElementById('varc-practice-log-container');
    const refTabsContainer = document.getElementById('ref-tabs-container');
    const refTabButtons = document.querySelectorAll('.ref-tab-btn');
    const refContentPanels = document.querySelectorAll('.ref-content-panel');
    const generateReportBtn = document.getElementById('generate-report-btn');
    const aiReportContainer = document.getElementById('ai-report-container');
    const referenceCache = {};

    // State Management
    let currentUser = null;
    let unsubscribeErrorLog = null;
    let unsubscribeVocabulary = null;
    let quizWords = [];
    let currentQuestionIndex = 0;
    let score = 0;
    let vocabularyList = []; 
    let unsubscribeMocks = null;
    let percentileChartInstance = null;
    let sectionalChartInstance = null;
    let unsubscribeQuantLog = null;
    let unsubscribeDilrLog = null;
    let unsubscribeVarcReading = null;
    let unsubscribeVarcPractice = null;
    let quizTimeoutId = null; // For clearing timeout on view switch

    // --- ACHIEVEMENTS ---
    const achievements = {
        FIRST_MOCK: {
            title: 'First Mock',
            description: 'You\'ve logged your first mock test. The journey has begun!',
            lockedDescription: 'Log your first mock test to unlock.',
            icon: '🏆',
            isUnlocked: (data) => data.mocks.length >= 1
        },
        MOCK_ENTHUSIAST: {
            title: 'Mock Enthusiast',
            description: 'You\'ve logged 5 mock tests. Keep up the great work!',
            lockedDescription: 'Log 5 mock tests to unlock.',
            icon: '🏅',
            isUnlocked: (data) => data.mocks.length >= 5
        },
        WORD_COLLECTOR: {
            title: 'Word Collector',
            description: 'You\'ve added 10 words to your vocabulary list.',
            lockedDescription: 'Add 10 words to your list to unlock.',
            icon: '📚',
            isUnlocked: (data) => data.vocabulary.length >= 10
        },
        WORD_WIZARD: {
            title: 'Word Wizard',
            description: 'You have an impressive 50 words in your vocabulary!',
            lockedDescription: 'Add 50 words to your list to unlock.',
            icon: '🧙‍♂️',
            isUnlocked: (data) => data.vocabulary.length >= 50
        },
        MISTAKE_IDENTIFIER: {
            title: 'Mistake Identifier',
            description: 'You\'ve logged 10 errors. Learning from mistakes is key!',
            lockedDescription: 'Log 10 errors to unlock.',
            icon: '🔎',
            isUnlocked: (data) => data.errorLog.length >= 10
        },
        QUANT_QUALIFIER: {
            title: 'Quant Qualifier',
            description: 'You\'ve completed 5 Quant practice sessions.',
            lockedDescription: 'Log 5 Quant practice sessions to unlock.',
            icon: '🧮',
            isUnlocked: (data) => data.quantLog.length >= 5
        }
    };


    function showToast(message, isError = true) {
        const toast = document.createElement('div');
        const bgColor = isError ? 'bg-red-500' : 'bg-green-500';
        toast.className = `p-4 text-white rounded-lg shadow-md pointer-events-auto transition-opacity duration-300 opacity-0`;
        toast.classList.add(bgColor);
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.remove('opacity-0'), 10);
        setTimeout(() => {
            toast.classList.add('opacity-0');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 4000);
    }

    auth.onAuthStateChanged(user => {
        currentUser = user;
        updateUIforAuthState(user);
        if (user) {
            // Collect all user data to pass to the achievement checker
            let allUserData = {
                mocks: [],
                vocabulary: [],
                errorLog: [],
                quantLog: [],
                dilrLog: [],
                varcReading: [],
                varcPractice: []
            };

            // Modified listeners now use a callback to update central data object
            listenForMocks(user.uid, (data) => {
                allUserData.mocks = data;
                renderAchievements(allUserData);
            });
            listenForVocabulary(user.uid, (data) => {
                allUserData.vocabulary = data;
                renderAchievements(allUserData);
            });
            listenForErrorLogs(user.uid, (data) => {
                allUserData.errorLog = data;
                renderAchievements(allUserData);
            });
            listenForQuantLogs(user.uid, (data) => {
                allUserData.quantLog = data;
                renderAchievements(allUserData);
            });
            listenForDilrLogs(user.uid, (data) => {
                allUserData.dilrLog = data;
                renderAchievements(allUserData);
            });
            listenForVarcReadingLogs(user.uid, (data) => {
                allUserData.varcReading = data;
                renderAchievements(allUserData);
            });  
            listenForVarcPracticeLogs(user.uid, (data) => {
                allUserData.varcPractice = data;
                renderAchievements(allUserData);
            });

        } else {
            // Unsubscribe from all listeners on logout
            if (unsubscribeErrorLog) unsubscribeErrorLog();
            if (unsubscribeVocabulary) unsubscribeVocabulary();
            if (unsubscribeMocks) unsubscribeMocks();
            if (unsubscribeQuantLog) unsubscribeQuantLog();
            if (unsubscribeDilrLog) unsubscribeDilrLog();
            if (unsubscribeVarcReading) unsubscribeVarcReading();  
            if (unsubscribeVarcPractice) unsubscribeVarcPractice(); 

            // Clear all UI
            renderErrorTable([]);
            renderVocabularyList([]);
            renderMockList([]);
            renderDashboard([]);
            renderSectionalChart([]);
            renderQuantLog([]);
            renderDilrLog([]);
            renderVarcReadingLog([]); 
            renderVarcPracticeLog([]);
            renderAchievements({ mocks: [], vocabulary: [], errorLog: [], quantLog: [] });
        }
    });

     const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    function updateUIforAuthState(user) {
        if (user) {
            loginOverlay.classList.add('hidden');
            appContainer.classList.remove('hidden');
            userEmailSpan.textContent = user.email;
        } else {
            loginOverlay.classList.remove('hidden');
            appContainer.classList.add('hidden');
            userEmailSpan.textContent = '';
        }
    }

    function switchView(viewToShow) {
        if (quizTimeoutId) clearTimeout(quizTimeoutId); // Clear quiz timer on view switch

        views.forEach(view => {
            if(view) view.classList.add('hidden');
        });
        const targetView = document.getElementById(`view-${viewToShow}`);
        if (targetView) targetView.classList.remove('hidden');
    }

    function renderErrorTable(errors) {
        if (!errorLogTableBody) return;
        errorLogTableBody.innerHTML = '';
        if (errors.length === 0) {
            errorLogTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-slate-500 py-4">No errors logged yet.</td></tr>`;
            return;
        }
        errors.forEach(error => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-4 py-4 text-sm font-medium text-slate-900">${error.topic}</td>
                <td class="px-4 py-4 text-sm text-slate-600">${error.section}</td>
                <td class="px-4 py-4 text-sm text-slate-600">${error.reason}</td>
                <td class="px-4 py-4 text-sm font-medium"><button data-id="${error.id}" class="text-red-600 hover:text-red-900 delete-error-btn">Delete</button></td>
            `;
            errorLogTableBody.appendChild(row);
        });
    }

    function renderVocabularyList(words) {
        if (!vocabListContainer) return;
        vocabListContainer.innerHTML = '';
        if (words.length === 0) {
            vocabListContainer.innerHTML = `<p class="text-center text-slate-500">Your vocabulary list is empty.</p>`;
            return;
        }
        words.forEach(word => {
            const wordEl = document.createElement('div');
            wordEl.className = 'group p-3 bg-slate-50 rounded-lg flex justify-between items-center';
            wordEl.innerHTML = `
                <div>
                    <h4 class="font-bold text-indigo-700 capitalize">${word.word}</h4>
                    <p class="text-sm text-slate-700 mt-1"><strong class="font-semibold">Meaning:</strong> ${word.meaning}</p>
                    <p class="text-sm text-slate-500 mt-1"><em><strong class="font-semibold">Example:</strong> ${word.example}</em></p>
                </div>
                <button data-id="${word.id}" class="delete-vocab-word-btn opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-600 font-bold text-xl px-3 py-1">&times;</button>
            `;
            vocabListContainer.appendChild(wordEl);
        });
    }

    function renderAchievements(userData) {
        const container = document.getElementById('achievements-container');
        if (!container) return;

        container.innerHTML = ''; // Clear existing achievements

        for (const key in achievements) {
            const achievement = achievements[key];
            const unlocked = achievement.isUnlocked(userData);

            const card = document.createElement('div');
            card.className = `bg-white p-6 rounded-2xl shadow-sm flex items-center space-x-4 transition-opacity ${unlocked ? '' : 'opacity-40'}`;
            
            card.innerHTML = `
                <div class="text-4xl">${achievement.icon}</div>
                <div>
                    <h3 class="font-bold text-slate-800">${achievement.title}</h3>
                    <p class="text-sm text-slate-500">${unlocked ? achievement.description : achievement.lockedDescription}</p>
                </div>
            `;
            container.appendChild(card);
        }
    }

    function displayQuestion() {
        if (currentQuestionIndex >= quizWords.length) {
            endQuiz();
            return;
        }

        const wordData = quizWords[currentQuestionIndex];
        quizWord.textContent = wordData.word;
        quizOptions.innerHTML = '';
        quizFeedback.innerHTML = '';

        const options = shuffleArray([...wordData.distractors, wordData.meaning]);
        const uniqueOptions = [...new Set(options)]; // Ensure no duplicate answers

        uniqueOptions.forEach(option => {
            const button = document.createElement('button');
            button.textContent = option;
            button.className = 'w-full text-left p-4 rounded-lg border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all';
            button.dataset.answer = option;
            quizOptions.appendChild(button);
        });
    }

    function checkAnswer(selectedOption) {
        const correctAnswer = quizWords[currentQuestionIndex].meaning;
        const allButtons = quizOptions.querySelectorAll('button');

        allButtons.forEach(button => {
            button.disabled = true;
            if (button.dataset.answer === correctAnswer) {
                button.classList.add('!bg-green-100', '!border-green-500');
            }
        });

        if (selectedOption.dataset.answer === correctAnswer) {
            score++;
            quizFeedback.textContent = 'Correct!';
            quizFeedback.className = 'mt-6 text-center font-semibold text-green-600';
        } else {
            selectedOption.classList.add('!bg-red-100', '!border-red-500');
            quizFeedback.textContent = `Incorrect. The correct answer was highlighted.`;
            quizFeedback.className = 'mt-6 text-center font-semibold text-red-600';
        }

        quizTimeoutId = setTimeout(() => {
            currentQuestionIndex++;
            displayQuestion();
        }, 2000);
    }

    function endQuiz() {
        quizContainer.classList.add('hidden');
        quizScoreContainer.classList.remove('hidden');
        quizFinalScore.textContent = `You scored ${score} out of ${quizWords.length}`;
    }

    function startQuiz() {
        if (vocabularyList.length < 4) {
            showToast("You need at least 4 words in your list to start a quiz.");
            return;
        }

        quizWords = shuffleArray([...vocabularyList]).slice(0, 10);
        currentQuestionIndex = 0;
        score = 0;

        quizStartContainer.classList.add('hidden');
        quizScoreContainer.classList.add('hidden');
        quizContainer.classList.remove('hidden');

        displayQuestion();
    }
    
    const calculateAccuracy = (correct, attempts) => {
        if (!attempts || attempts === 0) return 0;
        return Math.round((correct / attempts) * 100);
    };

    function renderMockList(mocks) {
        if (!mockListContainer) return;
        mockListContainer.innerHTML = '';
        if (mocks.length === 0) {
            mockListContainer.innerHTML = `<p class="text-center text-slate-500">No mock scores added yet.</p>`;
            return;
        }

        mocks.forEach(mock => {
            const varcAcc = calculateAccuracy(mock.varc_correct, mock.varc_attempts);
            const dilrAcc = calculateAccuracy(mock.dilr_correct, mock.dilr_attempts);
            const quantAcc = calculateAccuracy(mock.quant_correct, mock.quant_attempts);

            const mockEl = document.createElement('div');
            mockEl.className = 'bg-slate-50 rounded-lg p-4 border border-slate-200';
            mockEl.innerHTML = `
                <div class="flex justify-between items-center mb-4">
                    <h4 class="font-bold text-slate-800 text-lg">${mock.name}</h4>
                    <div class="text-right">
                        <p class="font-extrabold text-3xl text-indigo-600">${mock.overall_percentile}%ile</p>
                        <p class="text-sm text-slate-500 font-semibold">${mock.overall_score} Score</p>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200">
                    <div class="text-center">
                        <p class="text-xs text-slate-500 font-semibold">VARC %ile</p>
                        <p class="font-bold text-xl text-slate-700">${mock.varc_percentile}</p>
                        <p class="text-xs text-slate-500 mt-1">${varcAcc}% Acc</p>
                    </div>
                    <div class="text-center">
                        <p class="text-xs text-slate-500 font-semibold">DILR %ile</p>
                        <p class="font-bold text-xl text-slate-700">${mock.dilr_percentile}</p>
                        <p class="text-xs text-slate-500 mt-1">${dilrAcc}% Acc</p>
                    </div>
                    <div class="text-center">
                        <p class="text-xs text-slate-500 font-semibold">Quant %ile</p>
                        <p class="font-bold text-xl text-slate-700">${mock.quant_percentile}</p>
                        <p class="text-xs text-slate-500 mt-1">${quantAcc}% Acc</p>
                    </div>
                </div>
            `;
            mockListContainer.appendChild(mockEl);
        });
    }

    function renderDashboard(mocks) {
        if (!overallChartContainer) return;
        const canvas = document.getElementById('percentileChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (percentileChartInstance) {
            percentileChartInstance.destroy();
        }

        if (mocks.length < 2) {
            overallChartContainer.innerHTML = `<div class="flex items-center justify-center h-full text-slate-500">Add at least two mock scores to see your progress chart.</div>`;
            return;
        } else if (overallChartContainer.querySelector('canvas') === null) {
             overallChartContainer.innerHTML = '<canvas id="percentileChart"></canvas>';
        }


        const chartData = [...mocks].reverse();
        const labels = chartData.map(mock => mock.name);
        const percentileDataPoints = chartData.map(mock => mock.overall_percentile);
        
        const accuracyDataPoints = chartData.map(mock => {
            const totalCorrect = mock.varc_correct + mock.dilr_correct + mock.quant_correct;
            const totalAttempts = mock.varc_attempts + mock.dilr_attempts + mock.quant_attempts;
            return calculateAccuracy(totalCorrect, totalAttempts);
        });
        
        const allDataPoints = [...percentileDataPoints, ...accuracyDataPoints];

        percentileChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Overall Percentile',
                        data: percentileDataPoints,
                        borderColor: 'rgb(79, 70, 229)',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Overall Accuracy',
                        data: accuracyDataPoints,
                        borderColor: 'rgb(234, 179, 8)',
                        backgroundColor: 'rgba(234, 179, 8, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        suggestedMin: Math.min(...allDataPoints) - 5 < 0 ? 0 : Math.min(...allDataPoints) - 5,
                        suggestedMax: Math.max(...allDataPoints) + 5 > 100 ? 100 : Math.max(...allDataPoints) + 5,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    const unit = context.dataset.label === 'Overall Percentile' ? '%ile' : '%';
                                    label += `${context.parsed.y}${unit}`;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderSectionalChart(mocks) {
        if (!sectionalChartContainer) return;
        const canvas = document.getElementById('sectionalPercentileChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');


        if (sectionalChartInstance) {
            sectionalChartInstance.destroy();
        }

        if (mocks.length < 2) {
            sectionalChartContainer.innerHTML = `<div class="flex items-center justify-center h-full text-slate-500">Not enough data for sectional analysis.</div>`;
            return;
        } else if (sectionalChartContainer.querySelector('canvas') === null) {
            sectionalChartContainer.innerHTML = '<canvas id="sectionalPercentileChart"></canvas>';
        }


        const chartData = [...mocks].reverse();
        const labels = chartData.map(mock => mock.name);
        const varcData = chartData.map(mock => mock.varc_percentile);
        const dilrData = chartData.map(mock => mock.dilr_percentile);
        const quantData = chartData.map(mock => mock.quant_percentile);

        const allDataPoints = [...varcData, ...dilrData, ...quantData];

        sectionalChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'VARC %ile',
                        data: varcData,
                        borderColor: 'rgb(22, 163, 74)', // Green
                        backgroundColor: 'rgba(22, 163, 74, 0.1)',
                        fill: true,
                        tension: 0.4,
                    },
                    {
                        label: 'DILR %ile',
                        data: dilrData,
                        borderColor: 'rgb(217, 119, 6)', // Orange
                        backgroundColor: 'rgba(217, 119, 6, 0.1)',
                        fill: true,
                        tension: 0.4,
                    },
                    {
                        label: 'Quant %ile',
                        data: quantData,
                        borderColor: 'rgb(190, 24, 93)', // Rose
                        backgroundColor: 'rgba(190, 24, 93, 0.1)',
                        fill: true,
                        tension: 0.4,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        suggestedMin: Math.min(...allDataPoints) - 5 < 0 ? 0 : Math.min(...allDataPoints) - 5,
                        suggestedMax: Math.max(...allDataPoints) + 5 > 100 ? 100 : Math.max(...allDataPoints) + 5,
                        ticks: {
                            callback: value => value + '%'
                        }
                    }
                },
                 plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => ` ${context.dataset.label}: ${context.parsed.y}%ile`
                        }
                    }
                }
            }
        });
    }

    function renderVarcReadingLog(logs) {
        if (!varcReadingLogContainer) return;
        varcReadingLogContainer.innerHTML = '';
        if (logs.length === 0) {
            varcReadingLogContainer.innerHTML = `<p class="text-center text-slate-400 text-sm py-2">No reading logged yet.</p>`;
            return;
        }
        logs.forEach(log => {
            const logDate = log.timestamp?.toDate().toLocaleDateString() || 'Just now';
            const logEl = document.createElement('div');
            logEl.className = 'flex justify-between items-center text-sm p-2 rounded-md bg-slate-50';
            logEl.innerHTML = `
                <div class="flex-grow">
                    <span class="font-semibold text-slate-700">${log.passage_type}</span>
                    <span class="text-slate-500 ml-2">(${log.time_taken_reading} mins)</span>
                    <span class="text-xs text-slate-400 ml-2">${logDate}</span>
                </div>
                <button data-id="${log.id}" class="delete-varc-reading-btn text-xs text-red-500 hover:text-red-700 font-semibold px-2">Delete</button>
            `;
            varcReadingLogContainer.appendChild(logEl);
        });
    }

    function renderVarcPracticeLog(logs) {
        if (!varcPracticeLogContainer) return;
        varcPracticeLogContainer.innerHTML = '';
        if (logs.length === 0) {
            varcPracticeLogContainer.innerHTML = `<p class="text-center text-slate-400 text-sm py-2">No VA practice logged yet.</p>`;
            return;
        }
        logs.forEach(log => {
            const pace = (log.time_taken_va / log.number_attempted_va).toFixed(2);
            const logDate = log.timestamp?.toDate().toLocaleDateString() || 'Just now';
            const logEl = document.createElement('div');
            logEl.className = 'flex justify-between items-center text-sm p-2 rounded-md bg-slate-50';
            logEl.innerHTML = `
                <div class="flex-grow">
                    <span class="font-semibold text-slate-700">${log.question_type_va}</span>
                    <span class="text-slate-500 ml-2">(${log.number_attempted_va}Q in ${log.time_taken_va} mins)</span>
                </div>
                <div class="text-right mr-2">
                    <p class="text-slate-600">${pace} <span class="text-xs">min/q</span></p>
                    <p class="text-xs text-slate-400">${logDate}</p>
                </div>
                <button data-id="${log.id}" class="delete-varc-practice-btn text-xs text-red-500 hover:text-red-700 font-semibold px-2">Delete</button>
            `;
            varcPracticeLogContainer.appendChild(logEl);
        });
    }

    function renderQuantLog(logs) {
        if (!quantLogContainer) return;
        quantLogContainer.innerHTML = '';

        if (logs.length === 0) {
            quantLogContainer.innerHTML = `<p class="text-center text-slate-500 py-4">No practice sessions logged yet.</p>`;
            return;
        }

        logs.forEach(log => {
            const accuracy = log.questions_attempted > 0 ? Math.round((log.questions_correct / log.questions_attempted) * 100) : 0;
            const pace = log.questions_attempted > 0 ? (log.time_taken / log.questions_attempted).toFixed(2) : 0;
            const logDate = log.timestamp?.toDate().toLocaleDateString() || 'Just now';

            const logEl = document.createElement('div');
            logEl.className = 'p-4 border border-slate-200 rounded-lg grid grid-cols-3 md:grid-cols-5 gap-4 items-center';
            logEl.innerHTML = `
                <div class="col-span-2 md:col-span-1">
                    <p class="font-bold text-slate-800">${log.topic}</p>
                    <p class="text-xs text-slate-500">${logDate}</p>
                </div>
                <div class="text-center">
                    <p class="text-xs text-slate-500 font-semibold">Accuracy</p>
                    <p class="font-bold text-xl ${accuracy < 60 ? 'text-red-500' : 'text-green-600'}">${accuracy}%</p>
                </div>
                <div class="text-center">
                    <p class="text-xs text-slate-500 font-semibold">Pace</p>
                    <p class="font-bold text-xl text-slate-700">${pace} <span class="text-sm font-normal">min/q</span></p>
                </div>
                <div class="text-center">
                     <p class="text-xs text-slate-500 font-semibold">Stats</p>
                    <p class="font-bold text-slate-700">${log.questions_correct} / ${log.questions_attempted}</p>
                </div>
                <div class="text-center">
                    <button data-id="${log.id}" class="delete-quant-log-btn text-sm text-red-500 hover:text-red-700 font-semibold">Delete</button>
                </div>
            `;
            quantLogContainer.appendChild(logEl);
        });
    }

    function renderDilrLog(logs) {
        if (!dilrLogContainer) return;
        dilrLogContainer.innerHTML = '';

        if (logs.length === 0) {
            dilrLogContainer.innerHTML = `<p class="text-center text-slate-500 py-4">No DILR sets logged yet.</p>`;
            return;
        }

        logs.forEach(log => {
            const accuracy = log.total_questions_set > 0 ? Math.round((log.questions_correct_set / log.total_questions_set) * 100) : 0;
            const logDate = log.timestamp?.toDate().toLocaleDateString() || 'Just now';

            const logEl = document.createElement('div');
            logEl.className = 'p-4 border border-slate-200 rounded-lg grid grid-cols-3 md:grid-cols-5 gap-4 items-center';
            logEl.innerHTML = `
                <div class="col-span-2 md:col-span-1">
                    <p class="font-bold text-slate-800">${log.set_type}</p>
                    <p class="text-xs text-slate-500">${logDate}</p>
                </div>
                <div class="text-center">
                    <p class="text-xs text-slate-500 font-semibold">Accuracy</p>
                    <p class="font-bold text-xl ${accuracy < 75 ? 'text-amber-600' : 'text-green-600'}">${accuracy}%</p>
                </div>
                <div class="text-center">
                    <p class="text-xs text-slate-500 font-semibold">Time Taken</p>
                    <p class="font-bold text-xl text-slate-700">${log.time_taken_set} <span class="text-sm font-normal">mins</span></p>
                </div>
                <div class="text-center">
                     <p class="text-xs text-slate-500 font-semibold">Score</p>
                    <p class="font-bold text-slate-700">${log.questions_correct_set} / ${log.total_questions_set}</p>
                </div>
                <div class="text-center">
                    <button data-id="${log.id}" class="delete-dilr-log-btn text-sm text-red-500 hover:text-red-700 font-semibold">Delete</button>
                </div>
            `;
            dilrLogContainer.appendChild(logEl);
        });
    }

    function renderReferenceContent(data, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = ''; 

        data.topics.forEach(topic => {
            const topicEl = document.createElement('div');
            topicEl.className = 'bg-white p-6 rounded-xl shadow-sm';
            
            let itemsHtml = topic.items.map(item => `
                <li class="flex justify-between">
                    <span>${item.name}</span>
                    <span class="font-mono text-right">${item.formula || item.description}</span>
                </li>
            `).join('');

            topicEl.innerHTML = `
                <h3 class="font-semibold text-lg ${topic.color || 'text-slate-800'} mb-3">${topic.title}</h3>
                <ul class="space-y-3 text-sm text-slate-600">
                    ${itemsHtml}
                </ul>
            `;
            container.appendChild(topicEl);
        });
    }


    // --- FIRESTORE LOGIC & LISTENERS (Updated with callbacks) ---
    async function saveErrorLog(data) {
        if (!currentUser) return;
        try {
            await db.collection(`users/${currentUser.uid}/errorLog`).add({ ...data, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
            errorLogForm.reset();
            showToast("Error logged successfully!", false);
        } catch (error) {
            console.error("Error adding document: ", error);
            showToast("Error: Could not save your log.");
        }
    }
    
    function listenForErrorLogs(userId, callback) {
        const query = db.collection(`users/${userId}/errorLog`).orderBy('timestamp', 'desc');
        unsubscribeErrorLog = query.onSnapshot(snapshot => {
            const errors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderErrorTable(errors);
            if (callback) callback(errors);
        }, error => {
            console.error("Error listening for error logs:", error);
            showToast("Error: Could not load error logs.");
        });
    }

    async function deleteErrorLog(errorId) {
        if (!currentUser) return;
        if (confirm("Are you sure you want to delete this error?")) {
            try {
                await db.doc(`users/${currentUser.uid}/errorLog/${errorId}`).delete();
                showToast("Error log deleted.", false);
            } catch (error) {
                console.error("Error deleting document:", error);
                showToast("Error: Could not delete the log.");
            }
        }
    }

    async function saveVocabularyWord(wordData) {
        if (!currentUser) return;
        try {
            await db.collection(`users/${currentUser.uid}/vocabulary`).add({ ...wordData, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        } catch (error) {
            console.error("Error saving vocabulary word: ", error);
            showToast("Error: Could not save word to your list.");
        }
    }

    function listenForVocabulary(userId, callback) {
        const query = db.collection(`users/${userId}/vocabulary`).orderBy('timestamp', 'desc');
        unsubscribeVocabulary = query.onSnapshot(snapshot => {
            const words = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            vocabularyList = words;
            renderVocabularyList(words);
            if (callback) callback(words);
        }, error => {
            console.error("Error listening for vocabulary:", error);
            showToast("Error: Could not load your vocabulary list.");
        });
    }

    async function deleteVocabularyWord(wordId) {
        if (!currentUser) return;
        if (confirm("Are you sure you want to delete this word?")) {
            try {
                await db.doc(`users/${currentUser.uid}/vocabulary/${wordId}`).delete();
                showToast("Word deleted successfully.", false);
            } catch (error) {
                console.error("Error deleting vocabulary word:", error);
                showToast("Error: Could not delete the word.");
            }
        }
    }

    async function saveMock(data) {
        if (!currentUser) return;
        try {
            await db.collection(`users/${currentUser.uid}/mocks`).add({
                ...data,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            mockForm.reset();
            showToast("Mock score saved successfully!", false);
        } catch (error) {
            console.error("Error saving mock: ", error);
            showToast("Error: Could not save your mock score.");
        }
    }

    function listenForMocks(userId, callback) {
        const query = db.collection(`users/${userId}/mocks`).orderBy('timestamp', 'desc');
        unsubscribeMocks = query.onSnapshot(snapshot => {
            const mocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderMockList(mocks);
            renderDashboard(mocks);
            renderSectionalChart(mocks);
            if (callback) callback(mocks);
        }, error => {
            console.error("Error listening for mocks:", error);
            showToast("Error: Could not load mock scores.");
        });
    }

    async function saveVarcReadingLog(data) {
        if (!currentUser) return;
        try {
            await db.collection(`users/${currentUser.uid}/varcReadingLog`).add({
                ...data, timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            varcReadingForm.reset();
            showToast("Reading session logged!", false);
        } catch (error) { showToast("Error: Could not save reading log."); }
    }

    function listenForVarcReadingLogs(userId, callback) {
        const query = db.collection(`users/${userId}/varcReadingLog`).orderBy('timestamp', 'desc').limit(10);
        unsubscribeVarcReading = query.onSnapshot(snapshot => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderVarcReadingLog(logs);
            if (callback) callback(logs);
        }, error => { showToast("Error: Could not load reading logs."); });
    }

    async function deleteVarcReadingLog(logId) {
        if (!currentUser) return;
        if (confirm("Are you sure you want to delete this reading log?")) {
            try {
                await db.doc(`users/${currentUser.uid}/varcReadingLog/${logId}`).delete();
                showToast("Reading log deleted.", false);
            } catch (error) {
                showToast("Error: Could not delete the reading log.");
            }
        }
    }

    async function saveVarcPracticeLog(data) {
        if (!currentUser) return;
        try {
            await db.collection(`users/${currentUser.uid}/varcPracticeLog`).add({
                ...data, timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            varcPracticeForm.reset();
            showToast("VA practice logged!", false);
        } catch (error) { showToast("Error: Could not save VA practice log."); }
    }

    function listenForVarcPracticeLogs(userId, callback) {
        const query = db.collection(`users/${userId}/varcPracticeLog`).orderBy('timestamp', 'desc').limit(10);
        unsubscribeVarcPractice = query.onSnapshot(snapshot => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderVarcPracticeLog(logs);
            if (callback) callback(logs);
        }, error => { showToast("Error: Could not load VA practice logs."); });
    }

    async function deleteVarcPracticeLog(logId) {
        if (!currentUser) return;
        if (confirm("Are you sure you want to delete this VA practice log?")) {
            try {
                await db.doc(`users/${currentUser.uid}/varcPracticeLog/${logId}`).delete();
                showToast("VA practice log deleted.", false);
            } catch (error) {
                showToast("Error: Could not delete the VA practice log.");
            }
        }
    }

    async function saveQuantPracticeLog(data) {
        if (!currentUser) return;
        try {
            await db.collection(`users/${currentUser.uid}/quantPracticeLog`).add({
                ...data,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            quantPracticeForm.reset();
            showToast("Practice session logged!", false);
        } catch (error) {
            console.error("Error saving quant log: ", error);
            showToast("Error: Could not save your session.");
        }
    }

    function listenForQuantLogs(userId, callback) {
        const query = db.collection(`users/${userId}/quantPracticeLog`).orderBy('timestamp', 'desc').limit(20);
        unsubscribeQuantLog = query.onSnapshot(snapshot => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderQuantLog(logs);
            if (callback) callback(logs);
        }, error => {
            console.error("Error listening for quant logs:", error);
            showToast("Error: Could not load practice logs.");
        });
    }

    async function deleteQuantLog(logId) {
        if (!currentUser) return;
        if (confirm("Are you sure you want to delete this Quant log?")) {
            try {
                await db.doc(`users/${currentUser.uid}/quantPracticeLog/${logId}`).delete();
                showToast("Quant log deleted.", false);
            } catch (error) {
                console.error("Error deleting quant log:", error);
                showToast("Error: Could not delete the log.");
            }
        }
    }

    async function saveDilrSetLog(data) {
        if (!currentUser) return;
        try {
            await db.collection(`users/${currentUser.uid}/dilrSetLog`).add({
                ...data,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            dilrSetForm.reset();
            showToast("DILR set logged!", false);
        } catch (error) {
            console.error("Error saving DILR log: ", error);
            showToast("Error: Could not save your set log.");
        }
    }

    function listenForDilrLogs(userId, callback) {
        const query = db.collection(`users/${userId}/dilrSetLog`).orderBy('timestamp', 'desc').limit(20);
        unsubscribeDilrLog = query.onSnapshot(snapshot => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderDilrLog(logs);
            if (callback) callback(logs);
        }, error => {
            console.error("Error listening for DILR logs:", error);
            showToast("Error: Could not load DILR logs.");
        });
    }

    async function deleteDilrLog(logId) {
        if (!currentUser) return;
        if (confirm("Are you sure you want to delete this DILR log?")) {
            try {
                await db.doc(`users/${currentUser.uid}/dilrSetLog/${logId}`).delete();
                showToast("DILR log deleted.", false);
            } catch (error) {
                console.error("Error deleting DILR log:", error);
                showToast("Error: Could not delete the log.");
            }
        }
    }

    async function loadReferenceContent(tabId) {
        const container = document.getElementById(tabId);
        if (!container) return;

        if (referenceCache[tabId]) {
            renderReferenceContent(referenceCache[tabId], tabId);
            return;
        }

        container.innerHTML = `<div class="col-span-full mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-indigo-600"></div>`;

        try {
            const response = await fetch(`/reference/${tabId}.json`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            referenceCache[tabId] = data;
            renderReferenceContent(data, tabId);
        } catch (error) {
            console.error('Failed to load reference content:', error);
            container.innerHTML = `<p class="col-span-full text-center text-red-500">Could not load content. Please try again later.</p>`;
        }
    }

    if (refTabsContainer) {
        loadReferenceContent('quant-ref');

        refTabsContainer.addEventListener('click', (event) => {
            const clickedTab = event.target.closest('.ref-tab-btn');
            if (!clickedTab) return;

            const tabToActivate = clickedTab.dataset.tab;

            refTabButtons.forEach(button => {
                const isActive = button.dataset.tab === tabToActivate;
                button.classList.toggle('text-indigo-600', isActive);
                button.classList.toggle('border-indigo-500', isActive);
                button.classList.toggle('text-slate-500', !isActive);
                button.classList.toggle('border-transparent', !isActive);
            });

            refContentPanels.forEach(panel => {
                if (panel.id === tabToActivate) {
                    panel.classList.remove('hidden');
                    loadReferenceContent(tabToActivate);
                } else {
                    panel.classList.add('hidden');
                }
            });
        });
    }

    // --- EVENT LISTENERS ---
    navButtons.forEach(button => button.addEventListener('click', () => {
        switchView(button.dataset.view);
    }));

    loginBtn.addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => console.error("Auth failed:", error));
    });

    logoutBtn.addEventListener('click', () => auth.signOut());
    
    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', async () => {
            const btnText = generateReportBtn.querySelector('#btn-text');
            const btnSpinner = generateReportBtn.querySelector('#btn-spinner');
    
            generateReportBtn.disabled = true;
            btnText.textContent = 'Analyzing...';
            btnSpinner.classList.remove('hidden');
            aiReportContainer.innerHTML = 'Your AI coach is analyzing your weekly performance...';
    
            try {
                const generateWeeklyReport = functions.httpsCallable('generateWeeklyReport');
                const result = await generateWeeklyReport();
                const { report } = result.data;
                
                // A simple markdown to HTML converter
                let htmlReport = report
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italics
                    .replace(/(\r\n|\n|\r)/gm, '<br>');      // Newlines
                
                aiReportContainer.innerHTML = htmlReport;
    
            } catch (error) {
                console.error("Cloud function error:", error);
                aiReportContainer.innerHTML = `<p class="text-red-500">Error: Could not generate your report. Please try again later.</p>`;
            } finally {
                generateReportBtn.disabled = false;
                btnText.textContent = '✨ Generate Report';
                btnSpinner.classList.add('hidden');
            }
        });
    }

    if(errorLogForm) {
        errorLogForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const formData = new FormData(errorLogForm);
            const data = Object.fromEntries(formData.entries());
            saveErrorLog(data);
        });
    }

    if (errorLogTableBody) {
        errorLogTableBody.addEventListener('click', (event) => {
            if (event.target.classList.contains('delete-error-btn')) {
                deleteErrorLog(event.target.dataset.id);
            }
        });
    }

    if (vocabForm) {
        vocabForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!currentUser) return;
            const wordInput = vocabForm.querySelector('input[name="word"]');
            const word = wordInput.value.trim();
            if (!word) return;
            addWordBtn.disabled = true;
            addWordBtn.querySelector('span').textContent = 'Thinking...';
            vocabResult.innerHTML = `<div class="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-slate-300 border-t-indigo-600"></div>`;
            try {
                const getWordDefinition = functions.httpsCallable('getWordDefinition');
                const result = await getWordDefinition({ word: word });
                const { meaning, example, distractors } = result.data;
                vocabResult.innerHTML = `<div class="text-left w-full"><h5 class="font-bold text-indigo-700 capitalize">${word}</h5><p class="text-sm text-slate-700 mt-1"><strong class="font-semibold">Meaning:</strong> ${meaning}</p></div>`;
                await saveVocabularyWord({ word, meaning, example, distractors });
                wordInput.value = '';
            } catch (error) {
                console.error("Cloud function error:", error);
                vocabResult.innerHTML = `<p class="text-red-500">Error: Could not fetch definition. Please try again.</p>`;
            } finally {
                addWordBtn.disabled = false;
                addWordBtn.querySelector('span').textContent = '✨ Add Word';
            }
        });
    }

    if (startQuizBtn) {
        startQuizBtn.addEventListener('click', startQuiz);
    }

    if (vocabListContainer) {
        vocabListContainer.addEventListener('click', (event) => {
            const deleteBtn = event.target.closest('.delete-vocab-word-btn');
            if (deleteBtn) {
                const wordId = deleteBtn.dataset.id;
                deleteVocabularyWord(wordId);
            }
        });
    }

    if (restartQuizBtn) {
        restartQuizBtn.addEventListener('click', () => {
            quizScoreContainer.classList.add('hidden');
            quizStartContainer.classList.remove('hidden');
        });
    }

    if (quizOptions) {
        quizOptions.addEventListener('click', (event) => {
            if (event.target.tagName === 'BUTTON') {
                checkAnswer(event.target);
            }
        });
    }
    
    if (mockForm) {
        mockForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const formData = new FormData(mockForm);
            
            const data = {
                name: formData.get('name'),
                overall_score: Number(formData.get('overall_score')),
                overall_percentile: Number(formData.get('overall_percentile')),
                varc_percentile: Number(formData.get('varc_percentile')),
                varc_attempts: Number(formData.get('varc_attempts')),
                varc_correct: Number(formData.get('varc_correct')),
                dilr_percentile: Number(formData.get('dilr_percentile')),
                dilr_attempts: Number(formData.get('dilr_attempts')),
                dilr_correct: Number(formData.get('dilr_correct')),
                quant_percentile: Number(formData.get('quant_percentile')),
                quant_attempts: Number(formData.get('quant_attempts')),
                quant_correct: Number(formData.get('quant_correct')),
            };

            for (const key in data) {
                if (key !== 'name' && (data[key] === null || isNaN(data[key]))) {
                    showToast(`Error: Please enter a valid number for ${key.replace(/_/g, ' ')}.`);
                    return;
                }
            }
            
            if (data.varc_correct > data.varc_attempts || data.dilr_correct > data.dilr_attempts || data.quant_correct > data.quant_attempts) {
                showToast("Error: 'Correct' cannot be greater than 'Attempts'.");
                return;
            }
            
            if (data.overall_percentile < 0 || data.overall_percentile > 100 || data.varc_percentile < 0 || data.varc_percentile > 100 || data.dilr_percentile < 0 || data.dilr_percentile > 100 || data.quant_percentile < 0 || data.quant_percentile > 100) {
                showToast("Error: Percentile values must be between 0 and 100.");
                return;
            }

            saveMock(data);
        });
    }

    if (varcReadingForm) {
        varcReadingForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const formData = new FormData(varcReadingForm);
            const data = {
                passage_type: formData.get('passage_type'),
                time_taken_reading: Number(formData.get('time_taken_reading')),
            };
            if (data.time_taken_reading <= 0) {
                showToast("Error: Time must be a positive number.");
                return;
            }
            saveVarcReadingLog(data);
        });
    }

    if (varcPracticeForm) {
        varcPracticeForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const formData = new FormData(varcPracticeForm);
            const data = {
                question_type_va: formData.get('question_type_va'),
                number_attempted_va: Number(formData.get('number_attempted_va')),
                time_taken_va: Number(formData.get('time_taken_va')),
            };
            if (data.number_attempted_va <= 0 || data.time_taken_va <= 0) {
                showToast("Error: Attempts and time must be positive numbers.");
                return;
            }
            saveVarcPracticeLog(data);
        });
    }

    if (varcReadingLogContainer) {
        varcReadingLogContainer.addEventListener('click', (event) => {
            if (event.target.closest('.delete-varc-reading-btn')) {
                const logId = event.target.closest('.delete-varc-reading-btn').dataset.id;
                deleteVarcReadingLog(logId);
            }
        });
    }

    if (varcPracticeLogContainer) {
        varcPracticeLogContainer.addEventListener('click', (event) => {
            if (event.target.closest('.delete-varc-practice-btn')) {
                const logId = event.target.closest('.delete-varc-practice-btn').dataset.id;
                deleteVarcPracticeLog(logId);
            }
        });
    }

    if (quantPracticeForm) {
        quantPracticeForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const formData = new FormData(quantPracticeForm);

            const data = {
                topic: formData.get('topic'),
                questions_attempted: Number(formData.get('questions_attempted')),
                questions_correct: Number(formData.get('questions_correct')),
                time_taken: Number(formData.get('time_taken')),
            };

            if (data.questions_correct > data.questions_attempted) {
                showToast("Error: 'Correct' cannot be greater than 'Attempted'.");
                return;
            }
            if (data.questions_attempted <= 0 || data.time_taken <= 0) {
                showToast("Error: Attempts and time must be positive numbers.");
                return;
            }

            saveQuantPracticeLog(data);
        });
    }

    if (quantLogContainer) {
        quantLogContainer.addEventListener('click', (event) => {
            if (event.target.closest('.delete-quant-log-btn')) {
                const logId = event.target.closest('.delete-quant-log-btn').dataset.id;
                deleteQuantLog(logId);
            }
        });
    }

    if (dilrSetForm) {
        dilrSetForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const formData = new FormData(dilrSetForm);

            const data = {
                set_type: formData.get('set_type'),
                time_taken_set: Number(formData.get('time_taken_set')),
                total_questions_set: Number(formData.get('total_questions_set')),
                questions_correct_set: Number(formData.get('questions_correct_set')),
            };

            if (data.questions_correct_set > data.total_questions_set) {
                showToast("Error: 'Correct' cannot be greater than 'Total Questions'.");
                return;
            }
            if (data.time_taken_set <= 0 || data.total_questions_set <= 0) {
                showToast("Error: Time and total questions must be positive numbers.");
                return;
            }

            saveDilrSetLog(data);
        });
    }

    if (dilrLogContainer) {
        dilrLogContainer.addEventListener('click', (event) => {
            if (event.target.closest('.delete-dilr-log-btn')) {
                const logId = event.target.closest('.delete-dilr-log-btn').dataset.id;
                deleteDilrLog(logId);
            }
        });
    }

})();