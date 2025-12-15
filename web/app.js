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
    const todaysTasks = goals
        .filter(shouldGenerateTaskToday)
        .sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return b.metric.dailyMinutes - a.metric.dailyMinutes;
        });

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

    scheduleList.innerHTML = scheduleData.tasks.map(task => `
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
    `).join('');
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

    goalsList.innerHTML = goals.map(goal => {
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
    `}).join('');
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
    `;

    // Fixed blocks
    if (!config.fixedBlocks || config.fixedBlocks.length === 0) {
        fixedBlocksList.innerHTML = `
            <div class="empty-state">
                <p>No fixed blocks configured</p>
            </div>
        `;
        return;
    }

    fixedBlocksList.innerHTML = config.fixedBlocks.map(block => `
        <div class="fixed-block">
            <div class="fixed-block__name">${block.name}</div>
            <div class="fixed-block__details">
                ${formatTime(timeToMinutes(block.startTime))} - ${formatTime(timeToMinutes(block.endTime))}
                • ${block.recurrence.charAt(0).toUpperCase() + block.recurrence.slice(1)}
                ${block.weekDay ? ` (${block.weekDay})` : ''}
                ${block.date ? ` (${block.date})` : ''}
            </div>
        </div>
    `).join('');
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

        // Render all tabs
        renderSchedule(scheduleData);
        renderGoals(goals);
        renderSettings(config);

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

    scheduleList.addEventListener('click', async (e) => {
        // Find closest schedule item
        const item = e.target.closest('.schedule-item');
        if (!item) return;

        // Ignore fixed blocks or already completed items
        if (item.classList.contains('fixed')) return;

        // Get Goal ID from dataset (we need to add this to rendering)
        const goalId = item.dataset.goalId;
        if (!goalId) return;

        // Optimistic UI update
        item.classList.toggle('completed'); // Visual feedback immediately

        try {
            const response = await fetch(`${API_BASE}/goals/${goalId}/complete`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                // success
                // Reload data to update stats and other views
                reloadData();
            } else {
                // Revert on failure
                item.classList.toggle('completed');
                console.error('Failed to complete task:', result.message);
                alert('Failed to complete task');
            }
        } catch (error) {
            item.classList.toggle('completed');
            console.error('Error completing task:', error);
        }
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

    renderSchedule(scheduleData);
    renderGoals(goals);
    renderSettings(config);
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
