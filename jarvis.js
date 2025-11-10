const readline = require('readline');
const {
    loadGoals,
    addGoal,
    generateTodaysSchedule,
    completeTask,
    deleteGoal
} = require('./goalsManager');
const {
    loadConfig,
    addFixedBlock,
    removeFixedBlock,
    saveConfig,
    cleanupExpiredBlocks
} = require('./configManager');
const {
    displaySchedule,
    displayGoals,
    displayProgress,
    displayConfig,
    displayInteractiveHeader,
    displayInteractiveHelp,
    displayCLIHelp
} = require('./display');


// ============================================
// COMMAND ROUTING
// ============================================

const command = process.argv[2];
const arg = process.argv[3];


if (command === 'interactive' || command === 'i' || !command) {
    startInteractiveMode();
} else if (command === 'add') {
    promptAddGoal();
} else if (command === 'schedule') {
    displaySchedule(false); // CLI mode (not compact)
} else if (command === 'complete') {
    completeTaskCLI(arg);
} else if (command === 'help') {
    displayCLIHelp();
} else if (command === 'progress') {
    displayProgress();
} else if (command === 'goals') {
    displayGoals(false); // CLI mode (not compact)
} else if (command === 'delete') {
    deleteGoalCLI(arg);
} else if (command === 'config') {
    handleConfig(arg, process.argv[4]);
} else {
    console.log("Unknown command. Type 'node jarvis.js help' for usage.");
}


// ============================================
// GOAL MANAGEMENT (CLI)
// ============================================

//Interactive prompt to add a new goal
function promptAddGoal() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log("\n=== ADD NEW GOAL ===\n");

    rl.question("What's your goal? ", (description) => {
        rl.question("Frequency (daily/weekly/one-time)? ", (frequency) => {
            if (frequency === 'weekly') {
                promptWeeklyGoal(rl, description, frequency);
            } else {
                promptDailyOrOneTimeGoal(rl, description, frequency);
            }
        });
    });
}

//Prompts for weekly goal details
function promptWeeklyGoal(rl, description, frequency) {
    rl.question("Which day (Monday/Tuesday/...)? ", (weekDay) => {
        rl.question("Target date (YYYY-MM-DD)? ", (targetDate) => {
            rl.question("Priority (high/medium/low)? ", (priority) => {
                const goal = createGoalObject(description, frequency, priority, targetDate, weekDay, 60);
                addGoal(goal);
                console.log("\n✓ Goal added successfully!\n");
                rl.close();
            });
        });
    });
}

//Prompts for daily or one-time goal details
function promptDailyOrOneTimeGoal(rl, description, frequency) {
    rl.question('Daily minutes? ', (minutes) => {
        rl.question("Target date (YYYY-MM-DD)? ", (targetDate) => {
            rl.question("Priority (high/medium/low)? ", (priority) => {
                const goal = createGoalObject(description, frequency, priority, targetDate, null, parseInt(minutes));
                addGoal(goal);
                console.log("\n✓ Goal added successfully!\n");
                rl.close();
            });
        });
    });
}

//Creates a goal object with standard structure
function createGoalObject(description, frequency, priority, targetDate, weekDay, dailyMinutes) {
    return {
        id: Date.now(),
        description: description,
        frequency: frequency,
        createdDate: new Date().toISOString().split('T')[0],
        weekDay: weekDay,
        targetDate: targetDate,
        priority: priority,
        metric: {
            dailyMinutes: dailyMinutes,
            completed: 0,
            expectedCompletions: 0,
            progressPercentage: 0,
            streak: 0,
            lastCompleted: null
        }
    };
}

//Completes a task from CLI
function completeTaskCLI(taskNumber) {
    if (!taskNumber) {
        console.log('\n❌ Please specify a task number: node jarvis.js complete <number>\n');
        return;
    }

    const goals = loadGoals();
    const scheduleData = generateTodaysSchedule(goals);
    const completableTasks = scheduleData.tasks.filter(t => !t.isFixed);
    const taskIndex = parseInt(taskNumber) - 1;

    if (taskIndex < 0 || taskIndex >= completableTasks.length) {
        console.log(`\n❌ Invalid task number. You have ${completableTasks.length} tasks today.\n`);
        return;
    }

    const task = completableTasks[taskIndex];
    const success = completeTask(task.goalId);

    if (success) {
        console.log(`\n✓ Task completed: ${task.description}`);
        console.log("Goal progress updated!\n");
    } else {
        console.log("\n❌ Failed to complete task.\n");
    }
}

//Deletes a goal from CLI
function deleteGoalCLI(goalNumber) {
    if (!goalNumber) {
        console.log("\n❌ Please specify a goal number: node jarvis.js delete <number>\n");
        return;
    }

    const goals = loadGoals();
    const goalIndex = parseInt(goalNumber) - 1;

    if (goalIndex < 0 || goalIndex >= goals.length) {
        console.log(`\n❌ Invalid goal number. You have ${goals.length} goals.\n`);
        return;
    }

    const goalId = goals[goalIndex].id;
    const success = deleteGoal(goalId);

    if (success && success.length > 0) {
        console.log(`\n✓ Goal deleted: ${success[0].description}\n`);
    } else {
        console.log("\n❌ Failed to delete goal.\n");
    }
}

// ============================================
// CONFIGURATION (CLI)
// ============================================

//Handles config commands
function handleConfig(subcommand, value) {
    if (!subcommand) {
        displayConfig();
        return;
    }

    if (subcommand === 'start-time') {
        handleStartTimeConfig(value);
    } else if (subcommand === 'available-hours') {
        handleAvailableHoursConfig(value);
    } else if (subcommand === 'add-block') {
        handleAddBlockConfig(value);
    } else if (subcommand === 'remove-block') {
        handleRemoveBlockConfig(value);
    } else {
        console.log("\n❌ Unknown config command\n");
    }
}

function handleStartTimeConfig(value) {
    if (!value || !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
        console.log("\n❌ Invalid time format. Use HH:MM (24-hour), e.g., 08:00 or 14:30\n");
        return;
    }

    const config = loadConfig();
    config.startTime = value;
    saveConfig(config);
    console.log(`\n✓ Start time set to ${value}\n`);
}

function handleAvailableHoursConfig(value) {
    const hours = parseInt(value);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
        console.log("\n❌ Invalid hours. Must be between 1 and 24.\n");
        return;
    }

    const config = loadConfig();
    config.availableHours = hours;
    saveConfig(config);
    console.log(`\n✓ Available hours set to ${hours}\n`);
}

function handleAddBlockConfig(name) {
    const startTime = process.argv[5];
    const endTime = process.argv[6];
    const recurrence = process.argv[7] || "daily"; // Default to daily
    const weekDayOrDate = process.argv[8] || null;

    if (!name || !startTime || !endTime) {
        console.log("\n❌ Usage: node jarvis.js config add-block <name> <start> <end> [recurrence] [day/date]\n");
        console.log("Examples:");
        console.log("  Daily:    node jarvis.js config add-block Lunch 12:00 13:00 daily");
        console.log("  Weekly:   node jarvis.js config add-block Therapy 14:00 15:00 weekly Tuesday");
        console.log("  One-time: node jarvis.js config add-block Dentist 10:00 11:00 one-time 2025-11-15\n");
        return;
    }

    if (addFixedBlock(name, startTime, endTime, recurrence, weekDayOrDate)) {
        let confirmMsg = `\n✓ Fixed block added: ${name} (${startTime} - ${endTime})`;
        
        if (recurrence === "weekly") {
            confirmMsg += ` - Every ${weekDayOrDate}`;
        } else if (recurrence === "one-time") {
            confirmMsg += ` - On ${weekDayOrDate}`;
        } else {
            confirmMsg += " - Daily";
        }
        
        console.log(confirmMsg + "\n");
    }
}


function handleAddBlockConfig(name) {
    const startTime = process.argv[5];
    const endTime = process.argv[6];
    const recurrence = process.argv[7] || "daily"; // Default to daily
    const weekDayOrDate = process.argv[8] || null;

    if (!name || !startTime || !endTime) {
        console.log("\n❌ Usage: node jarvis.js config add-block <name> <start> <end> [recurrence] [day/date]\n");
        console.log("Examples:");
        console.log("  Daily:    node jarvis.js config add-block Lunch 12:00 13:00 daily");
        console.log("  Weekly:   node jarvis.js config add-block Therapy 14:00 15:00 weekly Tuesday");
        console.log("  One-time: node jarvis.js config add-block Dentist 10:00 11:00 one-time 2025-11-15\n");
        return;
    }

    if (addFixedBlock(name, startTime, endTime, recurrence, weekDayOrDate)) {
        let confirmMsg = `\n✓ Fixed block added: ${name} (${startTime} - ${endTime})`;
        
        if (recurrence === "weekly") {
            confirmMsg += ` - Every ${weekDayOrDate}`;
        } else if (recurrence === "one-time") {
            confirmMsg += ` - On ${weekDayOrDate}`;
        } else {
            confirmMsg += " - Daily";
        }
        
        console.log(confirmMsg + "\n");
    }
}

function handleRemoveBlockConfig(value) {
    const index = parseInt(value) - 1;
    if (removeFixedBlock(index)) {
        console.log(`\n✓ Fixed block removed\n`);
    } else {
        console.log(`\n❌ Invalid block number\n`);
    }
}


// ============================================
// INTERACTIVE MODE
// ============================================

//Starts interactive REPL mode
function startInteractiveMode() {
    cleanupExpiredBlocks();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '\n> '
    });

    console.clear();
    displayInteractiveHeader();
    displaySchedule(true); // Compact mode for interactive

    rl.prompt();

    rl.on('line', (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
            rl.prompt();
            return;
        }

        const [cmd, ...args] = trimmed.split(' ');

        // Handle quit before clearing screen
        if (cmd.toLowerCase() === 'q' || cmd.toLowerCase() === 'quit' || cmd.toLowerCase() === 'exit') {
            console.clear();
            console.log('\n👋 Great work today! See you tomorrow!\n');
            rl.close();
            return;
        }

         // Clear screen for other commands
        console.clear();
        displayInteractiveHeader();

        switch (cmd.toLowerCase()) {
            case 'c':
            case 'complete':
                handleInteractiveComplete(args[0]);
                displaySchedule(true);
                break;

            case 's':
            case 'schedule':
                displaySchedule(true);
                break;

            case 'g':
            case 'goals':
                displayGoals(true); // Compact mode
                break;

            case 'p':
            case 'progress':
                displayProgress();
                break;

            case 'h':
            case 'help':
                displayInteractiveHelp();
                break;

            default:
                console.log(`\n❌ Unknown command: "${cmd}". Type 'h' for help.`);
        }

        rl.prompt();
    });

    rl.on('close', () => {
        process.exit(0);
    });
}

//Handles task completion in interactive mode
function handleInteractiveComplete(taskNum) {
    if (!taskNum) {
        console.log('\n❌ Please specify task number: c 1\n');
        return;
    }

    const goals = loadGoals();
    const scheduleData = generateTodaysSchedule(goals);
    const completableTasks = scheduleData.tasks.filter(t => !t.isFixed);
    const taskIndex = parseInt(taskNum) - 1;

    if (taskIndex < 0 || taskIndex >= completableTasks.length) {
        console.log(`\n❌ Invalid task number. You have ${completableTasks.length} tasks.\n`);
        return;
    }

    const task = completableTasks[taskIndex];
    const success = completeTask(task.goalId);

    if (success) {
        console.log(`\n✓ Completed: ${task.description}\n`);
    } else {
        console.log('\n❌ Failed to complete task.\n');
    }
}
