/**
 * JARVIS Dashboard - Frontend JavaScript
 * Loads and displays goals, schedules, and configuration
 */

// ==========================================
// DATA PATHS
// ==========================================

const API_BASE = '/api';

const DATA_PATHS = {
    goals: `${API_BASE}/goals`,
    config: `${API_BASE}/config`,
    schedule: `${API_BASE}/schedule`
};

let currentGoals = [];

// ==========================================
// UTILITIES
// ==========================================

/**
 * Fetches JSON data from a file path
 */
async function fetchJSON(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load: ${path}`);
        return await response.json();
    } catch (error) {
        console.error('Error loading data:', error);
        return null;
    }
}

/**
 * Converts HH:MM time string to minutes since midnight
 */
function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Converts minutes to 12-hour time format with AM/PM
 */
function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
}

/**
 * Formats duration in minutes to readable string
 */
function formatDuration(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Gets formatted today's date
 */
function getFormattedDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('en-US', options);
}

/**
 * Gets today's date string in YYYY-MM-DD format
 */
function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Gets the current day name
 */
function getCurrentDayName() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

// ==========================================
// SCHEDULE GENERATION
// ==========================================

/**
 * Checks if a goal should generate a task today
 */
function shouldGenerateTaskToday(goal) {
    const today = getTodayString();
    const currentDay = getCurrentDayName();

    // Check if target date has passed
    if (goal.targetDate && goal.targetDate < today) {
        return false;
    }

    // Check if already completed today
    if (goal.metric.lastCompleted === today) {
        return false;
    }

    // Check frequency
    switch (goal.frequency) {
        case 'daily':
            return true;
        case 'weekly':
            return goal.weekDay === currentDay;
        case 'one-time':
            return goal.metric.completed === 0;
        default:
            return false;
    }
}

/**
 * Gets tasks for today, sorted by priority
 */
function getTodaysTasks(goals) {
    return goals
        .filter(shouldGenerateTaskToday)
        .sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return b.metric.dailyMinutes - a.metric.dailyMinutes;
        });
}

/**
 * Prepares fixed blocks for today from config
 */
function prepareFixedBlocks(config) {
    const today = getTodayString();
    const currentDay = getCurrentDayName();

    return config.fixedBlocks
        .filter(block => {
            if (block.recurrence === 'daily') return true;
            if (block.recurrence === 'weekly') return block.weekDay === currentDay;
            if (block.recurrence === 'one-time') return block.date === today;
            return false;
        })
        .map(block => ({
            name: block.name,
            startTime: timeToMinutes(block.startTime),
            endTime: timeToMinutes(block.endTime),
            isFixed: true,
            recurrence: block.recurrence
        }))
        .sort((a, b) => a.startTime - b.startTime);
}

/**
 * Generates today's complete schedule
 */
function generateSchedule(goals, config) {
    const schedule = [];
    const fixedBlocks = prepareFixedBlocks(config);

    // Get tasks for today
    const todaysTasks = getTodaysTasks(goals);

    let currentTime = timeToMinutes(config.startTime);
    const endTime = currentTime + (config.availableHours * 60);
    const bufferMinutes = 10;
    let fixedBlockIndex = 0;

    for (const task of todaysTasks) {
        let remainingMinutes = task.metric.dailyMinutes;
        let partNumber = 1;

        while (remainingMinutes > 0 && currentTime < endTime) {
            // Check for upcoming fixed block
            while (fixedBlockIndex < fixedBlocks.length &&
                fixedBlocks[fixedBlockIndex].endTime <= currentTime) {
                fixedBlockIndex++;
            }

            let availableTime = endTime - currentTime;

            // Check if fixed block is coming up
            if (fixedBlockIndex < fixedBlocks.length) {
                const nextFixed = fixedBlocks[fixedBlockIndex];

                if (currentTime < nextFixed.startTime) {
                    availableTime = nextFixed.startTime - currentTime;
                } else if (currentTime >= nextFixed.startTime && currentTime < nextFixed.endTime) {
                    // We're inside a fixed block, add it to schedule
                    schedule.push({
                        description: nextFixed.name,
                        startTime: nextFixed.startTime,
                        endTime: nextFixed.endTime,
                        duration: nextFixed.endTime - nextFixed.startTime,
                        isFixed: true,
                        recurrence: nextFixed.recurrence
                    });
                    currentTime = nextFixed.endTime + bufferMinutes;
                    fixedBlockIndex++;
                    continue;
                }
            }

            const taskDuration = Math.min(remainingMinutes, availableTime);

            if (taskDuration > 0) {
                const needsPart = task.metric.dailyMinutes > taskDuration && partNumber === 1;

                schedule.push({
                    goalId: task.id,
                    description: needsPart ?
                        `${task.description} (Part ${partNumber})` :
                        task.description,
                    startTime: currentTime,
                    endTime: currentTime + taskDuration,
                    duration: taskDuration,
                    priority: task.priority,
                    isFixed: false,
                    isCompleted: task.metric.lastCompleted === getTodayString()
                });

                currentTime += taskDuration + bufferMinutes;
                remainingMinutes -= taskDuration;
                partNumber++;
            }

            // Handle fixed block that starts soon
            if (fixedBlockIndex < fixedBlocks.length &&
                currentTime >= fixedBlocks[fixedBlockIndex].startTime) {
                const fixed = fixedBlocks[fixedBlockIndex];
                schedule.push({
                    description: fixed.name,
                    startTime: fixed.startTime,
                    endTime: fixed.endTime,
                    duration: fixed.endTime - fixed.startTime,
                    isFixed: true,
                    recurrence: fixed.recurrence
                });
                currentTime = fixed.endTime + bufferMinutes;
                fixedBlockIndex++;
            }
        }
    }

    // Add any remaining fixed blocks
    while (fixedBlockIndex < fixedBlocks.length) {
        const fixed = fixedBlocks[fixedBlockIndex];
        schedule.push({
            description: fixed.name,
            startTime: fixed.startTime,
            endTime: fixed.endTime,
            duration: fixed.endTime - fixed.startTime,
            isFixed: true,
            recurrence: fixed.recurrence
        });
        fixedBlockIndex++;
    }

    // Sort by start time
    schedule.sort((a, b) => a.startTime - b.startTime);

    return {
        tasks: schedule,
        totalMinutes: schedule.reduce((sum, t) => sum + t.duration, 0),
        taskCount: schedule.filter(t => !t.isFixed).length,
        fixedCount: schedule.filter(t => t.isFixed).length
    };
}

// ==========================================
// TAB NAVIGATION
// ==========================================

function initTabs() {
    const tabButtons = document.querySelectorAll('.nav-tabs__btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Update buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Update content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                    // Scroll to the content with a slight delay to ensure layout update
                    setTimeout(() => {
                        content.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                            inline: 'nearest'
                        });
                    }, 50);
                }
            });
        });
    });
}

// ==========================================
// RENDERING FUNCTIONS
// ==========================================

/**
 * Renders a single schedule item
 */
function renderScheduleItem(task) {
    return `
        <div class="schedule-item ${task.isFixed ? 'fixed' : ''} ${task.isCompleted ? 'completed' : ''}" 
             data-goal-id="${task.goalId || ''}"
             title="${task.isFixed ? 'Fixed Block' : 'Click to Complete'}">
            <div class="schedule-item__time">
                ${formatTime(task.startTime)}
            </div>
            <div class="schedule-item__content">
                <div class="schedule-item__task">${task.description}</div>
                <div class="schedule-item__duration">
                    ${formatDuration(task.duration)}
                    ${task.isFixed ? ' • Fixed Block' : ''}
                    ${task.priority ? ` • ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority` : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Renders a single goal card
 */
function renderGoalCard(goal) {
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (goal.metric.progressPercentage / 100) * circumference;
    const isComplete = goal.metric.progressPercentage >= 100;

    return `
        <div class="goal-card ${isComplete ? 'completed' : ''}">
            <div class="goal-card__header">
                <div>
                    <h3 class="goal-card__title">${goal.description}</h3>
                    <div class="goal-card__meta-row">
                        <span class="goal-card__priority ${goal.priority}">${goal.priority}</span>
                        ${goal.weekDay ? `<span class="goal-card__meta-item">📆 ${goal.weekDay}</span>` : ''}
                    </div>
                </div>
                
                <!-- Circular Arc Progress -->
                <div class="arc-progress">
                    <svg width="60" height="60" viewBox="0 0 60 60">
                        <circle class="arc-progress__bg" cx="30" cy="30" r="${radius}"></circle>
                        <circle class="arc-progress__fill" cx="30" cy="30" r="${radius}" 
                                style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}; stroke: ${isComplete ? '#00e5ff' : '#ffd700'}">
                        </circle>
                        <!-- Center Glow -->
                        <circle class="arc-progress__core" cx="30" cy="30" r="4" fill="${isComplete ? '#00e5ff' : '#ffd700'}"></circle>
                    </svg>
                    <div class="arc-progress__text">${goal.metric.progressPercentage}%</div>
                </div>
            </div>
            
            <div class="goal-card__details">
                <span class="goal-card__meta-item">
                    📅 ${goal.frequency}
                </span>
                <span class="goal-card__meta-item">
                    ⏱️ ${formatDuration(goal.metric.dailyMinutes)}
                </span>
                <span class="progress-stats__streak">🔥 ${goal.metric.streak} day streak</span>
            </div>
        </div>
    `;
}

/**
 * Renders a single fixed block configuration item
 */
function renderFixedBlock(block) {
    return `
        <div class="fixed-block">
            <div class="fixed-block__name">${block.name}</div>
            <div class="fixed-block__details">
                ${formatTime(timeToMinutes(block.startTime))} - ${formatTime(timeToMinutes(block.endTime))}
                • ${block.recurrence.charAt(0).toUpperCase() + block.recurrence.slice(1)}
                ${block.weekDay ? ` (${block.weekDay})` : ''}
                ${block.date ? ` (${block.date})` : ''}
            </div>
        </div>
    `;
}

/**
 * Renders the schedule tab
 */
function renderSchedule(scheduleData) {
    const scheduleList = document.getElementById('schedule-list');
    const scheduleStats = document.getElementById('schedule-stats');
    const scheduleSummary = document.getElementById('schedule-summary');

    // Stats
    scheduleStats.innerHTML = `
        <div class="stat-card">
            <div class="stat-card__value">${scheduleData.taskCount}</div>
            <div class="stat-card__label">Tasks Today</div>
        </div>
        <div class="stat-card">
            <div class="stat-card__value">${formatDuration(scheduleData.totalMinutes)}</div>
            <div class="stat-card__label">Total Duration</div>
        </div>
        <div class="stat-card">
            <div class="stat-card__value">${scheduleData.fixedCount}</div>
            <div class="stat-card__label">Fixed Blocks</div>
        </div>
    `;

    // Summary
    scheduleSummary.textContent = `${scheduleData.tasks.length} items scheduled`;

    // Schedule items
    if (scheduleData.tasks.length === 0) {
        scheduleList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state__icon">📭</div>
                <p>No tasks scheduled for today</p>
            </div>
        `;
        return;
    }

    scheduleList.innerHTML = scheduleData.tasks.map(renderScheduleItem).join('');
}

/**
 * Renders the goals tab
 */
function renderGoals(goals) {
    const goalsList = document.getElementById('goals-list');
    const goalsStats = document.getElementById('goals-stats');

    // Calculate stats
    const totalGoals = goals.length;
    const completedToday = goals.filter(g => g.metric.lastCompleted === getTodayString()).length;
    const avgProgress = goals.length > 0
        ? Math.round(goals.reduce((sum, g) => sum + g.metric.progressPercentage, 0) / goals.length)
        : 0;
    const maxStreak = Math.max(...goals.map(g => g.metric.streak), 0);

    // Stats cards
    goalsStats.innerHTML = `
        <div class="stat-card">
            <div class="stat-card__value">${totalGoals}</div>
            <div class="stat-card__label">Total Goals</div>
        </div>
        <div class="stat-card">
            <div class="stat-card__value">${completedToday}</div>
            <div class="stat-card__label">Done Today</div>
        </div>
        <div class="stat-card">
            <div class="stat-card__value">${avgProgress}%</div>
            <div class="stat-card__label">Avg Progress</div>
        </div>
        <div class="stat-card">
            <div class="stat-card__value">🔥 ${maxStreak}</div>
            <div class="stat-card__label">Best Streak</div>
        </div>
    `;

    // Goals cards
    if (goals.length === 0) {
        goalsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state__icon">🎯</div>
                <p>No goals yet. Add some via CLI!</p>
            </div>
        `;
        return;
    }

    goalsList.innerHTML = goals.map(renderGoalCard).join('');
}

/**
 * Renders the settings tab
 */
function renderSettings(config) {
    const configGeneral = document.getElementById('config-general');
    const fixedBlocksList = document.getElementById('fixed-blocks-list');

    // General config
    configGeneral.innerHTML = `
        <div class="settings-item">
            <span class="settings-item__label">Start Time</span>
            <span class="settings-item__value">${formatTime(timeToMinutes(config.startTime))}</span>
        </div>
        <div class="settings-item">
            <span class="settings-item__label">Available Hours</span>
            <span class="settings-item__value">${config.availableHours} hours</span>
        </div>
        <div class="settings-item">
            <span class="settings-item__label">End Time</span>
            <span class="settings-item__value">${formatTime(timeToMinutes(config.startTime) + config.availableHours * 60)}</span>
        </div>
        <div style="margin-top: 2rem; border-top: 1px solid #333; padding-top: 1rem;">
             <button id="debug-storage-btn" class="reflection-btn" style="width: 100%">🔍 Debug: Show Saved Reflections</button>
             <button id="clear-storage-btn" class="reflection-btn" style="width: 100%; margin-top: 0.5rem; color: #ff4444; border-color: #ff4444;">❌ Debug: Clear Reflections</button>
        </div>
        
        <div style="margin-top: 2rem;">
            <h3 style="color: #00ff00; border-bottom: 1px solid #333; padding-bottom: 0.5rem; margin-bottom: 1rem;">WEEKLY INSIGHTS</h3>
            <div id="insights-container">
                <!-- Insights will be injected here -->
            </div>
        </div>
    `;

    // Add listeners for debug buttons (need to wait for DOM update)
    setTimeout(() => {
        document.getElementById('debug-storage-btn').addEventListener('click', () => {
            const data = localStorage.getItem('jarvis_reflections');
            console.log('Current Storage:', data);
            alert(data ? `STORAGE CONTENT: \n${data} ` : 'Storage is EMPTY');
        });

        document.getElementById('clear-storage-btn').addEventListener('click', () => {
            if (confirm('Clear all reflections?')) {
                localStorage.removeItem('jarvis_reflections');
                alert('Cleared!');
            }
        });
    }, 100);

    // Fixed blocks
    if (!config.fixedBlocks || config.fixedBlocks.length === 0) {
        fixedBlocksList.innerHTML = `
        <div class="empty-state">
            <p>No fixed blocks configured</p>
        </div>
        `;
        return;
    }

    fixedBlocksList.innerHTML = config.fixedBlocks.map(renderFixedBlock).join('');
}

// ==========================================
// UI ENHANCEMENTS
// ==========================================

/**
 * Runs the boot sequence animation
 */
function initBootSequence() {
    const fadeElements = document.querySelectorAll('.fade-in');

    fadeElements.forEach((el, index) => {
        setTimeout(() => {
            el.classList.add('visible');

            // Play sound if we had one
            // new Audio('boot.mp3').play().catch(() => {}); 
        }, index * 200 + 300); // Stagger start
    });
}

/**
 * Typing effect for main title
 */
function initTypingEffect() {
    const title = document.getElementById('main-title');
    if (!title) return;

    // Store original text and clear
    // const text = title.textContent; // We know it's "JARVIS" from HTML
    const text = "JARVIS";
    title.textContent = "";

    let i = 0;
    const typeInterval = setInterval(() => {
        title.textContent += text.charAt(i);
        i++;
        if (i >= text.length) {
            clearInterval(typeInterval);
        }
    }, 150); // Speed of typing
}

/**
 * Injects CSS for the reflection modal
 */
function injectReflectionStyles() {
    const styleId = 'reflection-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .reflection-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            backdrop-filter: blur(5px);
        }
        
        .reflection-modal {
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 8px;
            width: 90%;
            max-width: 500px;
            padding: 2rem;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            font-family: 'Courier New', monospace;
            color: #00ff00;
        }

        .reflection-modal h2 {
            margin-top: 0;
            color: #00ff00;
            text-transform: uppercase;
            font-size: 1.2rem;
            border-bottom: 1px solid #333;
            padding-bottom: 1rem;
            margin-bottom: 1.5rem;
        }

        .reflection-question {
            margin-bottom: 1.5rem;
        }

        .reflection-question label {
            display: block;
            margin-bottom: 0.5rem;
            color: #aaa;
            font-size: 0.9rem;
        }

        .reflection-input {
            width: 100%;
            background: #111;
            border: 1px solid #333;
            color: #00ff00;
            padding: 0.8rem;
            font-family: inherit;
            border-radius: 4px;
            resize: vertical;
            min-height: 60px;
        }

        .reflection-input:focus {
            outline: none;
            border-color: #00ff00;
        }

        .reflection-actions {
            display: flex;
            justify-content: flex-end;
            gap: 1rem;
            margin-top: 2rem;
        }

        .reflection-btn {
            background: transparent;
            border: 1px solid #333;
            color: #aaa;
            padding: 0.5rem 1.5rem;
            cursor: pointer;
            font-family: inherit;
            transition: all 0.2s;
        }

        .reflection-btn:hover {
            border-color: #666;
            color: #fff;
        }

        .reflection-btn.primary {
            background: #00ff00;
            color: #000;
            border-color: #00ff00;
            font-weight: bold;
        }

        .reflection-btn.primary:hover {
            background: #00cc00;
        }
    `;
    document.head.appendChild(style);
}

/**
 * SAVE REFLECTION TO LOCAL STORAGE
 */
function saveReflection(goalId, answers) {
    const STORAGE_KEY = 'jarvis_reflections';
    const today = getTodayString();

    try {
        console.log(`Attempting to save reflection for goal ${goalId} on ${today} `);
        const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

        if (!store[goalId]) store[goalId] = {};
        store[goalId][today] = answers;

        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        console.log('Reflection saved for goal', goalId);
        // Debug Alert
        alert(`Reflection saved!\nGoal: ${goalId} \nDate: ${today} \nAnswers: ${answers.length} `);
        return true;
    } catch (e) {
        console.error('Failed to save reflection', e);
        alert(`Failed to save reflection: ${e.message} `);
        return false;
    }
}

/**
 * SHOW REFLECTION MODAL
 */
function showReflectionModal(goal, onComplete) {
    injectReflectionStyles();

    const questions = goal.reflectionQuestions && goal.reflectionQuestions.length > 0
        ? goal.reflectionQuestions
        : ["How did it go?", "Any notes for next time?"];

    const overlay = document.createElement('div');
    overlay.className = 'reflection-modal-overlay';

    // Auto-focus logic variable
    let inputs = [];

    const html = `
        <div class="reflection-modal">
            <h2>> Reflection: ${goal.description}</h2>
            <form id="reflection-form">
                ${questions.map((q, i) => `
                    <div class="reflection-question">
                        <label>> ${q}</label>
                        <textarea class="reflection-input" name="q_${i}" placeholder="_"></textarea>
                    </div>
                `).join('')}
                <div class="reflection-actions">
                    <button type="button" class="reflection-btn" id="skip-btn">Skip</button>
                    <button type="submit" class="reflection-btn primary">Save Log</button>
                </div>
            </form>
        </div>
        `;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('#reflection-form');
    const skipBtn = overlay.querySelector('#skip-btn');
    const firstInput = overlay.querySelector('textarea');
    if (firstInput) firstInput.focus();

    const close = () => {
        document.body.removeChild(overlay);
        if (onComplete) onComplete();
    };

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const answers = questions.map((q, i) => ({
            question: q,
            answer: formData.get(`q_${i}`)
        }));

        saveReflection(goal.id, answers);
        close();
    });

    skipBtn.addEventListener('click', close);

    // Close on click outside
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
}

/**
 * SHOW COMPLETION MODAL (Quality Based)
 */
function showCompletionModal(goal, onCallback) {
    injectReflectionStyles();

    const overlay = document.createElement('div');
    overlay.className = 'completion-modal-overlay';

    const html = `
        <div class="completion-modal">
            <h2>
                <span>> COMPLETE TASK</span>
                <span style="font-size: 0.8em; opacity: 0.7">${goal.description}</span>
            </h2>
            
            <div class="quality-selector">
                <button type="button" class="quality-btn" data-score="100">
                    <span class="score">100%</span>
                    <span class="label">PERFECT</span>
                </button>
                <button type="button" class="quality-btn" data-score="75">
                    <span class="score">75%</span>
                    <span class="label">GOOD</span>
                </button>
                <button type="button" class="quality-btn" data-score="50">
                    <span class="score">50%</span>
                    <span class="label">OKAY</span>
                </button>
                <button type="button" class="quality-btn" data-score="25">
                    <span class="score">25%</span>
                    <span class="label">POOR</span>
                </button>
            </div>

            <div style="margin-top: 1rem; text-align: center;">
                 <button type="button" class="reflection-btn" id="btn-skip-task" style="color: #666; font-size: 0.8em; border: none;">
                     SKIP THIS TASK
                 </button>
            </div>

            <div class="reason-group" id="reason-group">
                <textarea class="reason-input" id="reason-input" placeholder="> Optional: What happened? (Reason for low score)"></textarea>
            </div>

            <div class="modal-actions">
                <button type="button" class="action-btn" id="cancel-btn">Cancel</button>
                <button type="button" class="action-btn primary" id="confirm-btn">Confirm Completion</button>
            </div>
        </div >
        `;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    // Elements
    const buttons = overlay.querySelectorAll('.quality-btn');
    const reasonGroup = overlay.querySelector('#reason-group');
    const reasonInput = overlay.querySelector('#reason-input');
    const confirmBtn = overlay.querySelector('#confirm-btn');
    const cancelBtn = overlay.querySelector('#cancel-btn');

    let selectedScore = null;

    // Handle Score Selection
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update UI
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            selectedScore = parseInt(btn.dataset.score);

            // Show reason input if score < 100
            if (selectedScore < 100) {
                reasonGroup.classList.add('visible');
                reasonInput.focus();
            } else {
                reasonGroup.classList.remove('visible');
            }
        });
    });

    // Validations
    const close = () => {
        // remove overlay
        overlay.style.opacity = '0';
        setTimeout(() => document.body.removeChild(overlay), 300);
    };

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    confirmBtn.addEventListener('click', async () => {
        if (selectedScore === null) {
            alert('Please select a quality score.');
            return;
        }

        const reason = reasonInput.value.trim();

        // API Call
        try {
            confirmBtn.innerText = 'PROCESSING...';
            confirmBtn.disabled = true;

            const response = await fetch(`${API_BASE}/goals/${goal.id}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ score: selectedScore, reason: reason })
            });

            const result = await response.json();

            if (result.success) {
                // Save Completion Details Locally
                const completionData = {
                    id: Date.now(),
                    goalId: goal.id,
                    goalDescription: goal.description,
                    date: getTodayString(),
                    score: selectedScore,
                    reason: reason
                };

                const STORAGE_KEY = 'jarvis_completions';
                const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                store.push(completionData);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

                console.log('Completion saved:', completionData);

                close();
                if (onCallback) onCallback();

            } else {
                alert('Failed: ' + result.message);
                confirmBtn.innerText = 'Confirm Completion';
                confirmBtn.disabled = false;
            }
        } catch (error) {
            console.error(error);
            alert('Error completing task');
            confirmBtn.innerText = 'Confirm Completion';
            confirmBtn.disabled = false;
        }
    });

    // Auto-select 100? No, force user to choose to be mindful.

    // Skip Button Handler
    const skipBtn = overlay.querySelector('#btn-skip-task');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            close();
            showSkipModal(goal, onCallback);
        });
    }
}

/**
 * SHOW SKIP MODAL
 */
function showSkipModal(goal, onCallback) {
    const overlay = document.createElement('div');
    overlay.className = 'reflection-modal-overlay'; // Re-use reflection modal styles

    const html = `
        <div class="reflection-modal">
            <h2>> SKIP TASK: ${goal.description}</h2>
            <div class="reflection-question">
                <label>> Why are you skipping this?</label>
                <select id="skip-reason-select" class="reflection-input" style="margin-bottom: 0.5rem">
                    <option value="Too tired">Too tired</option>
                    <option value="No time">No time</option>
                    <option value="Not relevant today">Not relevant today</option>
                    <option value="Sick/Unwell">Sick/Unwell</option>
                    <option value="Other">Other...</option>
                </select>
                <textarea id="skip-reason-custom" class="reflection-input" placeholder="Custom reason..." style="display: none;"></textarea>
            </div>
            <div class="reflection-actions">
                <button type="button" class="reflection-btn" id="cancel-skip">Cancel</button>
                <button type="button" class="reflection-btn primary" id="confirm-skip" style="border-color: #ff4444; color: #ff4444;">Confirm Skip</button>
            </div>
        </div>
    `;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    const select = overlay.querySelector('#skip-reason-select');
    const customInput = overlay.querySelector('#skip-reason-custom');
    const cancelBtn = overlay.querySelector('#cancel-skip');
    const confirmBtn = overlay.querySelector('#confirm-skip');

    select.addEventListener('change', () => {
        if (select.value === 'Other') {
            customInput.style.display = 'block';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
        }
    });

    const closeSkip = () => {
        document.body.removeChild(overlay);
    };

    cancelBtn.addEventListener('click', closeSkip);

    confirmBtn.addEventListener('click', async () => {
        const reason = select.value === 'Other' ? customInput.value : select.value;

        try {
            const response = await fetch(`${API_BASE}/goals/${goal.id}/skip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });

            if (response.ok) {
                closeSkip();
                if (onCallback) onCallback();
            } else {
                alert('Failed to skip task');
            }
        } catch (e) {
            console.error(e);
            alert('Error skipping task');
        }
    });
}


// ==========================================
// PATTERN RECOGNITION & INSIGHTS
// ==========================================

/**
 * GENERATE WEEKLY INSIGHTS
 */
function generateInsights(goals) {
    const insights = [];

    // 1. Analyze Skips
    goals.forEach(goal => {
        if (!goal.history) return;

        const skips = goal.history.filter(h => h.type === 'SKIP');
        if (skips.length >= 2) {
            // Count reasons
            const reasons = {};
            skips.forEach(s => {
                reasons[s.reason] = (reasons[s.reason] || 0) + 1;
            });

            // Find most common reason
            const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
            if (topReason) {
                insights.push(`⚠️ You've skipped "${goal.description}" ${skips.length} times recently. Main reason: "${topReason[0]}"`);
            }
        }
    });

    // 2. Analyze Success Time
    goals.forEach(goal => {
        if (!goal.history) return;

        const completions = goal.history.filter(h => h.type === 'COMPLETION');
        if (completions.length >= 3) {
            const hours = completions.map(c => new Date(c.timestamp).getHours());
            const avgHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
            const period = avgHour >= 12 ? 'PM' : 'AM';
            const displayHour = avgHour % 12 || 12;

            // Calculate consistency (std dev roughly)
            const isConsistent = hours.every(h => Math.abs(h - avgHour) <= 2);

            if (isConsistent) {
                insights.push(`✨ You consistently crush "${goal.description}" around ${displayHour} ${period}.`);
            }
        }
    });

    // 3. Highlight Streaks
    const topStreak = goals.sort((a, b) => b.metric.streak - a.metric.streak)[0];
    if (topStreak && topStreak.metric.streak > 3) {
        insights.push(`🔥 ${topStreak.description} is on fire! ${topStreak.metric.streak} day streak.`);
    }

    return insights;
}

/**
 * Render Insights Section
 */
function renderInsights(goals) {
    const container = document.getElementById('insights-container');
    if (!container) return; // Needs to be added to HTML first

    const insights = generateInsights(goals);

    if (insights.length === 0) {
        container.innerHTML = `<div style="color: #666; font-style: italic;">No patterns detected yet. Keep tracking!</div>`;
        return;
    }

    container.innerHTML = insights.map(text => `
        <div class="insight-item" style="margin-bottom: 0.5rem; padding-left: 1rem; border-left: 2px solid #00ff00;">
            ${text}
        </div>
    `).join('');
}

// ==========================================
// CHRONOMETER HEADER LOGIC
// ==========================================

function initChronometer() {
    const yearsRing = document.getElementById('ring-years');
    const monthsRing = document.getElementById('ring-months');
    const daysRing = document.getElementById('ring-days');

    if (!yearsRing || !monthsRing || !daysRing) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    const currentDay = now.getDate(); // 1-31

    // --- Generate Years (Current +/- 10) ---
    const yearRange = 20;
    const startYear = currentYear - 10;
    const yearAngleStep = 360 / yearRange;

    for (let i = 0; i < yearRange; i++) {
        const year = startYear + i;
        const el = document.createElement('div');
        el.className = 'ring-item';
        el.textContent = year;
        if (year === currentYear) el.classList.add('active');

        // Position on ring
        const angle = i * yearAngleStep;
        // Radius is ~260px (half of 550px ring width roughly minus padding)
        const radius = 260;

        el.style.transform = `rotate(${angle}deg) translateY(-${radius}px)`;
        yearsRing.appendChild(el);
    }

    // Rotate Years Ring to align current year to top (0deg)
    // Find index of current year
    const currentYearIndex = currentYear - startYear;
    const yearsRotation = -1 * (currentYearIndex * yearAngleStep);
    yearsRing.style.transform = `translate(-50%, -50%) rotate(${yearsRotation}deg)`;


    // --- Generate Months ---
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthAngleStep = 360 / 12;

    months.forEach((month, i) => {
        const el = document.createElement('div');
        el.className = 'ring-item';
        el.textContent = month;
        if (i === currentMonth) el.classList.add('active');

        const angle = i * monthAngleStep;
        const radius = 195; // Half of 420px ring width roughly

        el.style.transform = `rotate(${angle}deg) translateY(-${radius}px)`;
        monthsRing.appendChild(el);
    });

    // Rotate Months Ring
    const monthsRotation = -1 * (currentMonth * monthAngleStep);
    monthsRing.style.transform = `translate(-50%, -50%) rotate(${monthsRotation}deg)`;


    // --- Generate Days ---
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dayAngleStep = 360 / daysInMonth;

    for (let i = 1; i <= daysInMonth; i++) {
        const el = document.createElement('div');
        el.className = 'ring-item';
        el.textContent = i;
        if (i === currentDay) el.classList.add('active');

        const angle = (i - 1) * dayAngleStep;
        const radius = 135; // Half of 300px ring width roughly

        el.style.transform = `rotate(${angle}deg) translateY(-${radius}px)`;
        daysRing.appendChild(el);
    }

    // Rotate Days Ring
    const daysRotation = -1 * ((currentDay - 1) * dayAngleStep);
    daysRing.style.transform = `translate(-50%, -50%) rotate(${daysRotation}deg)`;
}

// ==========================================
// INITIALIZATION
// ==========================================

async function init() {
    // Set current date (now legacy/removed, but keeping for safety if moved elsewhere)
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.textContent = getFormattedDate();

    // Initialize tabs
    initTabs();

    // Initialize UI Enhancements
    // initParticles(); // Removed
    initTypingEffect();
    initBootSequence();
    initChronometer(); // New Chronometer

    // Load data
    try {
        const [goals, config, scheduleData] = await Promise.all([
            fetchJSON(DATA_PATHS.goals),
            fetchJSON(DATA_PATHS.config),
            fetchJSON(DATA_PATHS.schedule)
        ]);

        if (!goals || !config || !scheduleData) {
            console.error('Failed to load data', { goals, config, scheduleData });
            return;
        }

        currentGoals = goals;

        // Render all tabs
        renderSchedule(scheduleData);
        renderGoals(goals);
        renderSettings(config);
        renderInsights(goals); // Render insights on load

        // Add interaction listeners
        setupInteractions();

    } catch (error) {
        console.error("Initialization error:", error);
    }

    console.log('Jarvis Dashboard initialized successfully!');
}

/**
 * Sets up event listeners for interactions
 */
function setupInteractions() {
    // Schedule Item Clicks (Task Completion)
    const scheduleList = document.getElementById('schedule-list');

    scheduleList.addEventListener('click', (e) => {
        // Find closest schedule item
        const item = e.target.closest('.schedule-item');
        if (!item) return;

        // Ignore fixed blocks or already completed items
        if (item.classList.contains('fixed')) return;

        // Get Goal ID from dataset
        const goalId = item.dataset.goalId;
        if (!goalId) return;

        // Find the goal object
        const goal = currentGoals.find(g => g.id.toString() === goalId.toString());
        if (!goal) return;

        // Show Quality Completion Modal
        showCompletionModal(goal, () => {
            // Reload data after successful completion
            reloadData();
        });
    });

    // Goals List Clicks (To be implemented)
}

/**
 * Reloads data and refreshes UI
 */
async function reloadData() {
    const [goals, config, scheduleData] = await Promise.all([
        fetchJSON(DATA_PATHS.goals),
        fetchJSON(DATA_PATHS.config),
        fetchJSON(DATA_PATHS.schedule)
    ]);

    currentGoals = goals;

    renderSchedule(scheduleData);
    renderGoals(goals);
    renderSettings(config);
    renderInsights(goals); // Render insights on reload
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
