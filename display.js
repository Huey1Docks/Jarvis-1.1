const { loadGoals, generateTodaysSchedule } = require('./goalsManager');
const { loadConfig } = require('./configManager');

//Formats duration in minutes to human-readable string
function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

//Creates a CLI header box with title 
function createHeader(title) {
    const width = 47;
    const padding = Math.floor((width - title.length - 2) / 2);
    const paddedTitle = ' '.repeat(padding) + title + ' '.repeat(padding);
    
    return `
╔${'═'.repeat(width)}╗
║${paddedTitle.padEnd(width)}║
╚${'═'.repeat(width)}╝
`;
}

//Gets formatted today's date
function getFormattedDate() {
    return new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
    });
}

// ============================================
// SCHEDULE DISPLAY
// ============================================

//Displays today's schedule with optional formatting
function displaySchedule(compact = false) {
    const goals = loadGoals();
    
    if (goals.length === 0) {
        console.log('\n📋 No goals yet! Add one to get started.\n');
        return;
    }
    
    const scheduleData = generateTodaysSchedule(goals);
    const completableTasks = scheduleData.tasks.filter(t => !t.isFixed);
    
    if (completableTasks.length === 0) {
        console.log('\n🎉 No tasks scheduled for today! All caught up!\n');
        return;
    }
    
    // Header
    if (!compact) {
        console.log(`\nTODAY'S SCHEDULE - ${getFormattedDate()}`);
        console.log(`Start: ${scheduleData.startTime} | End: ${scheduleData.endTime}`);
    } else {
        console.log('\n📋 TODAY\'S SCHEDULE:\n');
    }
    
    // Overcommitment warning
    if (scheduleData.overcommitted) {
        const hoursNeeded = (scheduleData.totalMinutes / 60).toFixed(1);
        const hoursAvailable = (scheduleData.availableMinutes / 60).toFixed(1);
        console.log(`⚠️  WARNING: ${hoursNeeded}h of tasks, only ${hoursAvailable}h available!`);
    }
    
    console.log('='.repeat(70));
    
    // Tasks
    let taskNum = 1;
    scheduleData.tasks.forEach(task => {
        if (task.isFixed) {
            const time = `${task.startTime} - ${task.endTime}`.padEnd(20, ' ');
            const desc = task.description.padEnd(30, ' ');
            const duration = formatDuration(task.duration);
            console.log(` 🔒| ${time} | ${desc} | [${duration}]`);
        } else {
            const time = `${task.startTime} - ${task.endTime}`.padEnd(20, ' ');
            const desc = task.description.padEnd(30, ' ');
            const duration = formatDuration(task.duration);
            const priority = compact ? '' : ` | ${task.priority.toUpperCase()}`;
            console.log(` ${taskNum} | ${time} | ${desc} | [${duration}]${priority}`);
            taskNum++;
        }
    });
    
    console.log('='.repeat(70));
    
    if (!compact) {
        console.log();
    } else {
        console.log(`\nEnd time: ${scheduleData.endTime}`);
    }
}

// ============================================
// GOALS DISPLAY
// ============================================

//Displays all goals with progress
function displayGoals(compact = false) {
    const goals = loadGoals();
    
    if (goals.length === 0) {
        console.log('\n📊 No goals yet!\n');
        return;
    }
    
    if (compact) {
        console.log('\n📊 YOUR GOALS:\n');
    } else {
        console.log('\n=== YOUR GOALS ===\n');
    }
    
    goals.forEach((goal, index) => {
        console.log(`${index + 1}. ${goal.description}`);
        
        if (compact) {
            // Compact: single line
            const freq = goal.frequency === 'one-time' ? 'once' : goal.frequency;
            console.log(`   ${freq} | Priority: ${goal.priority}`);
        } else {
            // Full: multiple lines
            console.log(`   Frequency: ${goal.frequency}`);
            if (goal.weekDay) console.log(`   Day: ${goal.weekDay}`);
            console.log(`   Priority: ${goal.priority}`);
            console.log(`   Target: ${goal.targetDate}`);
        }
        
        // Progress
        if (goal.frequency === 'one-time') {
            console.log(`   Status: ${goal.metric.completed > 0 ? '✓ Complete' : '○ Incomplete'}`);
        } else {
            console.log(`   Progress: ${goal.metric.progressPercentage}% | Streak: ${goal.metric.streak} 🔥`);
            if (!compact) {
                console.log(`   Completions: ${goal.metric.completed}/${goal.metric.expectedCompletions} expected`);
            }
        }
        
        console.log();
    });
}

// ============================================
// PROGRESS DISPLAY
// ============================================

//Displays today's progress summary
function displayProgress() {
    const goals = loadGoals();
    
    if (goals.length === 0) {
        console.log('\n📈 No goals yet!\n');
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const completedToday = goals.filter(g => g.metric.lastCompleted === today);
    
    console.log('\n📈 TODAY\'S PROGRESS:\n');
    console.log(`Completed: ${completedToday.length}`);
    console.log(`Remaining: ${goals.length - completedToday.length}\n`);
    
    if (completedToday.length > 0) {
        console.log('✓ Completed Today:');
        completedToday.forEach(g => {
            console.log(`  • ${g.description}`);
        });
        console.log();
    }
}


// ============================================
// CONFIG DISPLAY
// ============================================

//Displays current configuration
function displayConfig() {
    const config = loadConfig();
    
    console.log('\n=== JARVIS CONFIG ===\n');
    console.log(`Start Time: ${config.startTime}`);
    console.log(`Available Hours: ${config.availableHours}`);
    console.log(`\nFixed Blocks: ${config.fixedBlocks.length}`);
    
    if (config.fixedBlocks.length > 0) {
        config.fixedBlocks.forEach((block, i) => {
            const recurring = block.recurring ? '(Daily)' : '(One-time)';
            console.log(`  ${i + 1}. ${block.name}: ${block.startTime} - ${block.endTime} ${recurring}`);
        });
    }
    console.log();
}

// ============================================
// INTERACTIVE MODE HELPERS
// ============================================

//Displays interactive mode header
function displayInteractiveHeader() {
    const today = getFormattedDate();
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║       JARVIS - Goal Architect             ║');
    console.log(`║     ${today.padEnd(37, ' ')} ║`);
    console.log('╚═══════════════════════════════════════════╝\n');
}

//Displays interactive mode help
function displayInteractiveHelp() {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║              COMMANDS                     ║');
    console.log('╚═══════════════════════════════════════════╝\n');
    console.log(' c <N> / complete <N>  Complete task number N');
    console.log(' s / schedule          Show today\'s schedule');
    console.log(' g / goals             List all goals');
    console.log(' p / progress          Show today\'s progress');
    console.log(' h / help              Show this help');
    console.log(' q / quit              Exit Jarvis\n');
}

//Displays CLI help
function displayCLIHelp() {
    console.log(`
JARVIS - Your Adaptive Goal Architect

Usage: node jarvis.js [command]

Commands:
  (none)       Start interactive mode
  add          Add a new goal
  schedule     Show today's schedule
  complete N   Complete task number N
  goals        List all goals
  delete N     Delete a goal
  progress     Show today's progress
  
Config Commands:
  config                      Show configuration
  config start-time HH:MM     Set start time
  config available-hours N    Set available hours
  config add-block NAME START END    Add fixed time block
  config remove-block N       Remove fixed block
  
  help         Show this message
    `);
}

module.exports = {
    // Formatting
    formatDuration,
    createHeader,
    getFormattedDate,
    
    // Display functions
    displaySchedule,
    displayGoals,
    displayProgress,
    displayConfig,
    
    // Interactive helpers
    displayInteractiveHeader,
    displayInteractiveHelp,
    displayCLIHelp
};