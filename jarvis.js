const readline  = require('readline');
const {
    loadGoals, 
    addGoal, 
    generateTodaysSchedule, 
    completeTask,
    deleteGoal,
} = require('./goalsManager');
const { 
    loadConfig, 
    setStartTime, 
    setAvailableHours,
    addFixedBlock,
    removeFixedBlock,
    listFixedBlocks,  
    saveConfig} = require('./configManager');

const command = process.argv[2];
const arg = process.argv[3];


if(command === 'interactive' || command === 'i' || !command){
    startInteractiveMode();
}else if(command === 'add'){
    promptAddGoal();
}else if(command === 'schedule'){
    showSchedule();
}else if(command === "complete"){
    completeTaskCLI(arg);
}else if(command === 'help'){
    showHelp();
}else if(command === "progress"){
    showProgress();
}else if(command === "goals"){
    showGoals();
}else if(command === "delete"){
    deleteGoalCLI(arg);
}else if (command === 'config') {
    handleConfig(arg, process.argv[4]);
}else{
    console.log("Unknown command. Type 'node jarvis.js help' for usage.");
}

function showHelp() {
    console.log(`
JARVIS - Your Adaptive Goal Architect

Usage: node jarvis.js <command>

Commands:
  add         Add a new goal
  schedule    Show today's schedule
  complete [N]  Complete task number N
  goals       List all goals
  delete [N]    Delete a goal
  /////// Config Commands /////////////
  config       Show start time, availble time and fixed blocks
  config start-time [00:00] change start time to []
  config available-hours [num]   change available time
  help        Show this help message
    `);
}

function promptAddGoal(){
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log("\n=== ADD NEW GOAL ===\n");

    rl.question("what's your goal? ", (description) => {
        rl.question("Frequency (daily/weekly/one-time)? ", (frequency) => {

            if(frequency === 'weekly'){
                rl.question("Which day (Monday/Tuesday/Wednesday/...)? ", (weekDay) => {
                    rl.question("What is your target date? (YYYY-MM-DD) ", (targetDate)=>{
                        rl.question("What is the priority of this goal?(high,medium,low)",(priority)=>{
                        
                            const goal = {
                                id: Date.now(),
                                description: description,
                                frequency: frequency,
                                createdDate: new Date().toISOString().split('T')[0],
                                weekDay: weekDay,
                                targetDate: targetDate,
                                priority: priority,
                                    metric: {
                                        dailyMinutes: 60,
                                        completed: 0,
                                        expectedCompletions: 0,
                                        progressPercentage: 0,
                                        streak: 0,
                                        lastCompleted: null
                                    }
                            };

                        addGoal(goal);
                        console.log("\n✓ Goal added successfully!\n");
                        rl.close();
                        })
                    })
                });
            }else{
                rl.question('Daily Minutes? ',(minutes)=>{
                    rl.question("What is your target date? (YYYY-MM-DD) ", (targetDate)=>{
                        rl.question("What is the priority of this goal?(high,medium,low)",(priority)=>{
                            
                            const goal = {
                                id: Date.now(),
                                description: description,
                                frequency: frequency,
                                createdDate: new Date().toISOString().split('T')[0],
                                weekDay: null,
                                targetDate: targetDate,
                                priority: priority,
                                    metric: {
                                        dailyMinutes: parseInt(minutes),
                                        completed: 0,
                                        expectedCompletions: 0,
                                        progressPercentage: 0,
                                        streak: 0,
                                        lastCompleted: null
                                    }
                            };

                             addGoal(goal);
                              console.log("\n✓ Goal added successfully!\n");
                            rl.close();
                        })
                    })
                })
            }
        })
    })


}

function showSchedule(){
    const goals = loadGoals();

    if (goals.length === 0) {
        console.log("\nNo goals yet! Add one with: node jarvis.js add\n");
        return;
    };

    const scheduleData = generateTodaysSchedule(goals);  //returns object

    if (scheduleData.tasks.length === 0) {
        console.log("\n🎉 No tasks scheduled for today! All caught up!\n");
        return;
    }


    const today = new Date();
    const formattedToday = today.toLocaleDateString('en-us', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    console.log(`\nTODAY'S SCHEDULE - ${formattedToday}`);

     console.log(`Start: ${scheduleData.startTime} | End: ${scheduleData.endTime}`);
    
    // Show warning if overcommitted
    if (scheduleData.overcommitted) {
        const hoursNeeded = (scheduleData.totalMinutes / 60).toFixed(1);
        const hoursAvailable = (scheduleData.availableMinutes / 60).toFixed(1);
        console.log(`⚠️  WARNING: ${hoursNeeded} hours of tasks, but only ${hoursAvailable} hours available!`);
    }

    console.log('='.repeat(75));

    scheduleData.tasks.forEach((task, index) => {
    if (task.isFixed) {
        // Display fixed block differently
        const time = `${task.startTime} - ${task.endTime}`.padEnd(20, ' ');
        const desc = task.description.padEnd(25, ' ');
        const duration = `${task.duration} min`.padEnd(10, ' ');
        
        console.log(`   | ${time} | ${desc} | ${duration} | FIXED`);
    } else {
        // Regular task
        const num = (index + 1).toString().padStart(2, ' ');
        const time = `${task.startTime} - ${task.endTime}`.padEnd(20, ' ');
        const desc = task.description.padEnd(25, ' ');
        const duration = `${task.duration} min`.padEnd(10, ' ');
        const priority = task.priority.toUpperCase();
        
        console.log(`${num} | ${time} | ${desc} | ${duration} | ${priority}`);
    }
});

    console.log("=".repeat(75));
    console.log();
};

function completeTaskCLI(taskNumber){

    if(!taskNumber){
        console.log('\n❌ Please specify a task number: node jarvis.js complete <number>\n');
        return;
    }

    const goals = loadGoals();
    const scheduleData = generateTodaysSchedule(goals);  // Get object
    const completableTasks = scheduleData.tasks.filter(t => !t.isFixed);

    const taskIndex = parseInt(taskNumber) - 1;

    if(taskIndex < 0 || taskIndex >= completableTasks.length){
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

function showGoals(){
    const goals = loadGoals();

    if(goals.length === 0){
        console.log("\nThere are no goals. Add one with: node jarvis.js add\n");
        return;
    }

    console.log("\n=== YOUR GOALS ===\n");

    goals.forEach((goal,index) =>{
        console.log(`${index + 1}. ${goal.description}`);
        console.log(`   Frequency: ${goal.frequency}`);
        if (goal.weekDay) console.log(`   Day: ${goal.weekDay}`);
        console.log(`   Priority: ${goal.priority}`);
        console.log(`   Target: ${goal.targetDate}`);
        
        //progress display per goal
         if (goal.frequency === 'one-time') {
            console.log(`   Status: ${goal.metric.completed > 0 ? '✓ Complete' : '○ Incomplete'}`);
        } else {
            console.log(`   Progress: ${goal.metric.progressPercentage}% (${goal.metric.completed}/${goal.metric.expectedCompletions} expected)`);
            console.log(`   Streak: ${goal.metric.streak} days`);
        }

        console.log();
    });

}

function deleteGoalCLI(goalNumber){

    if(!goalNumber){
        console.log("\n❌ Please specify a goal number: node jarvis.js delete <number>\n")
        return;
    }

    const goals = loadGoals();
    const goalIndex = parseInt(goalNumber) - 1;

    if(goalIndex < 0 || goalIndex >= goals.length){
        console.log(`\nInvalid goal number. You have ${goals.length} goals.\n`);
        return;
    }


    const goal = goals[goalIndex].id;
    const success = deleteGoal(goal);

    if(success){
        console.log(`\n✓ Goal deleted: ${success.description}\n`);
    } else {
        console.log("\n❌ Failed to delete goal.\n");
    }

}

function showProgress(){
    const goals = loadGoals();

    if(goals.length === 0){
        console.log("\nNo goals yet!\n");
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const completedToday = goals.filter(g => g.metric.lastCompleted === today);
    

    console.log("\n=== TODAY'S PROGRESS ===\n");
    console.log(`Completed: ${completedToday.length}`);
    console.log(`Remaining: ${goals.length - completedToday.length}`);
    console.log();

    if (completedToday.length > 0) {
        console.log("✓ Completed Today:");
        completedToday.forEach(g => {
            console.log(`  • ${g.description}`);
        });
        console.log();
    }
}

function handleConfig(subcommand, value) {
    if (!subcommand) {
        // Show current config
        const config = loadConfig();
        console.log("\n=== JARVIS CONFIG ===\n");
        console.log(`Start Time: ${config.startTime}`);
        console.log(`Available Hours: ${config.availableHours}`);
        console.log(`\nFixed Blocks: ${config.fixedBlocks.length}`);
        
        if (config.fixedBlocks.length > 0) {
            config.fixedBlocks.forEach((block, i) => {
                const recurring = block.recurring ? "(Daily)" : "(One-time)";
                console.log(`  ${i + 1}. ${block.name}: ${block.startTime} - ${block.endTime} ${recurring}`);
            });
        }
        console.log();
        return;
    }
    
    if (subcommand === 'start-time') {

          // Validate time format (HH:MM in 24-hour format)
         if (!value || !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
        console.log("\n❌ Invalid time format. Use HH:MM (24-hour), e.g., 08:00 or 14:30\n");
        return;
         }
    
        const config = loadConfig();
        config.startTime = value;
        saveConfig(config);
        console.log(`\n✓ Start time set to ${value}\n`);
        return;
    } else if (subcommand === 'available-hours') {
        const hours = parseInt(value);
        if (isNaN(hours) || hours <= 0 || hours > 24) {
        console.log("\n❌ Invalid hours. Must be between 1 and 24.\n");
        return;
        }
    
        const config = loadConfig();
        config.availableHours = hours;
        saveConfig(config);
        console.log(`\n✓ Available hours set to ${hours}\n`);
        return;
    } else if (subcommand === 'add-block') {
        // node jarvis.js config add-block Lunch 12:00 13:00
        // node jarvis.js config add-block Meeting 15:00 16:00 false
        const name = value;
        const startTime = process.argv[5];
        const endTime = process.argv[6];
        const recurring = process.argv[7] !== 'false';  // Default true
        
        if (!name || !startTime || !endTime) {
            console.log("\n❌ Usage: node jarvis.js config add-block <name> <start> <end> [recurring]\n");
            console.log("Example: node jarvis.js config add-block Lunch 12:00 13:00\n");
            return;
        }
        
        if (addFixedBlock(name, startTime, endTime, recurring)) {
            console.log(`\n✓ Fixed block added: ${name} (${startTime} - ${endTime})\n`);
        }
    } else if (subcommand === 'remove-block') {
        const index = parseInt(value) - 1;
        if (removeFixedBlock(index)) {
            console.log(`\n✓ Fixed block removed\n`);
        } else {
            console.log(`\n❌ Invalid block number\n`);
        }
    } else {
        console.log("\n❌ Unknown config command\n");
    }
}

function startInteractiveMode(){
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '\n> '
    });

    console.clear();
    displayHeader();
    displaySchedule();

    rl.prompt();

     rl.on('line', (input) => {
    const trimmed = input.trim();
    
    if (!trimmed) {
        // Empty input - just show prompt again
        rl.prompt();
        return;
    }
    
    const [cmd, ...args] = trimmed.split(' ');

    if (cmd.toLowerCase() === 'q' || cmd.toLowerCase() === 'quit' || cmd.toLowerCase() === 'exit') {
        console.clear();
        console.log('\n👋 Great work today! See you tomorrow!\n');
        rl.close();
        return;
    }
    
    // Clear screen for cleaner display
    console.clear();
    displayHeader();
    
    switch(cmd.toLowerCase()) {
        case 'c':
        case 'complete':
            handleInteractiveComplete(args[0]);
            displaySchedule();  // Show updated schedule
            break;
        
        case 's':
        case 'schedule':
            displaySchedule();
            break;
        
        case 'g':
        case 'goals':
            displayGoals();
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

function displayHeader() {
    const today = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
    });

    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║       JARVIS - Goal Architect             ║');
    console.log(`║     ${today.padEnd(37, ' ')} ║`);
    console.log('╚═══════════════════════════════════════════╝\n');
}

function displaySchedule() {
    const goals = loadGoals();
    
    if (goals.length === 0) {
        console.log('\n📋 No goals yet! Type "add" to create your first goal.\n');
        return;
    }
    
    const scheduleData = generateTodaysSchedule(goals);
    const completableTasks = scheduleData.tasks.filter(t => !t.isFixed);
    
    if (completableTasks.length === 0) {
        console.log('\n🎉 No tasks for today! All caught up!\n');
        return;
    }
    
    console.log('\n📋 TODAY\'S SCHEDULE:\n');
    
    let taskNum = 1;

    console.log('='.repeat(70));
    scheduleData.tasks.forEach(task => {
        if (task.isFixed) {

            console.log(` 🔒| ${task.startTime} - ${task.endTime.padEnd(9, ' ')} | ${task.description.padEnd(30, ' ')} | [${formatDuration(task.duration)}]`);
        } else {
            const time = `${task.startTime} - ${task.endTime}`.padEnd(13);
            const duration = formatDuration(task.duration);
            console.log(` ${taskNum} | ${time.padEnd(20, ' ')} | ${task.description.padEnd(30, ' ')} | [${duration}]`);
            taskNum++;
        }
    });
    console.log("=".repeat(70));
    
    // Show summary
    if (scheduleData.overcommitted) {
        const hoursNeeded = (scheduleData.totalMinutes / 60).toFixed(1);
        const hoursAvailable = (scheduleData.availableMinutes / 60).toFixed(1);
        console.log(`\n⚠️  WARNING: ${hoursNeeded}h of tasks, only ${hoursAvailable}h available!`);
    }
    
    console.log(`\nEnd time: ${scheduleData.endTime}`);
}

function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function displayGoals() {
    console.log('\n📊 YOUR GOALS:\n');
    const goals = loadGoals();
    
    if (goals.length === 0) {
        console.log('No goals yet!\n');
        return;
    }
    
    goals.forEach((goal, index) => {
        console.log(`${index + 1}. ${goal.description}`);
        console.log(`   ${goal.frequency} | Priority: ${goal.priority}`);
        
        if (goal.frequency !== 'one-time') {
            console.log(`   Progress: ${goal.metric.progressPercentage}% | Streak: ${goal.metric.streak} 🔥`);
        }
        console.log();
    });
}

function displayProgress() {
    const goals = loadGoals();
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