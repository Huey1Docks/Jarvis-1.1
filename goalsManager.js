
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./configManager');

const MEMORY_FILE = path.join(__dirname, './goals.json');
const BUFFER_MINUTES = 10; // Buffer time between tasks

function loadGoals(){
        try{
            if(fs.existsSync(MEMORY_FILE)){
                const data = fs.readFileSync(MEMORY_FILE, 'utf8');
                return JSON.parse(data || '[]');
            }
        }catch(error){
            console.error("Error loading memory:", error.message);
        }
        return [];
}

function saveGoals(goals){
     try{
        const dir = path.dirname(MEMORY_FILE);

        if(!fs.existsSync(dir)){
            fs.mkdirSync(dir, {recursive: true});
        }
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(goals,null,2), 'utf8');
        return true;
    }catch(error){
        console.error("Error saving goals:", error.message);
        return false;
    }
}


function addGoal(goalData){
    try{
        const data = loadGoals();
        data.push(goalData);
        saveGoals(data);
        return true;
    }catch(error){
        console.error('Error adding goal:' , error.message);
        return false;
    }
}

function deleteGoal(goalId){
    try{
        const goals = loadGoals();
        const index = goals.findIndex(goal => goal.id === goalId);

        if (index === -1) return false; 

        const [ deletedGoal ] = goals.splice(index, 1);   
        console.log(`Deleted: `, deletedGoal);   
        saveGoals(goals);

        return deletedGoal;  
    }catch(error){
        console.error("Error deleting goal:", error.message);
        return false;
    }
}

function updateGoal(goalId, updates){
    try{
        const data = loadGoals();
        const goalIndex = data.findIndex(goal => goal.id === goalId);

        if(goalIndex === -1){
            console.log("Goal was not found");
            return false;
        }

        data[goalIndex] = {...data[goalIndex],...updates};
        return saveGoals(data);
    }catch(error){
        console.error("Error updating goal:", error.message);
        return false;
    }
}

// ============================================
// SECTION 2: SCHEDULE GENERATION LOGIC
// ============================================

//returns false/true if this goal needs a task today
function shouldGenerateTaskToday(goal){
    const todayDate = new Date();
    const dayName = todayDate.toLocaleDateString("en-US", { weekday: "long" });
    const todayString = new Date().toLocaleDateString("en-CA");

    
    //already completed today
    if(goal.metric.lastCompleted === todayString) {
        return false;
    }

    //check based on frequency eg.daily/weekly/one-time
    if(goal.frequency === "daily") {
        return todayString <= goal.targetDate;
    } else if(goal.frequency === "weekly" && goal.weekDay === dayName) {
        return todayString <= goal.targetDate;
    } else if(goal.frequency === "one-time") {
        return todayString >= goal.targetDate;
    }

    return false;
}


//create a task object from a goal 
//assign part #s to tasks if task is divided
function createTask(goal, startTime, duration, partNumber = 1) {
    const isMultiPart = partNumber > 1;

    return {
        id: Date.now() + Math.random(),
        goalId: goal.id,
        description: isMultiPart 
            ? `${goal.description} (Part ${partNumber})` 
            : goal.description,
        startTime: formatTime(startTime),
        endTime: formatTime(startTime + duration),
        duration: duration,
        priority: goal.priority,
        completed: false,
        isPart: isMultiPart
    };
}

//create a fixed block as a task for the schedule
function createFixedBlockEntry(block) {
    return {
        id: `block_${block.name}`,
        description: `🔒 ${block.name}`,
        startTime: formatTime(block.start),
        endTime: formatTime(block.end),
        duration: block.end - block.start,
        isFixed: true,
        priority: 'FIXED'
    };
}

//store/prepare fixed blocks for scheduling in sorted order
//array of blocks in minutes sorted by start time 
function prepareFixedBlocks(config) {
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    const todayDayName = today.toLocaleDateString("en-US", { weekday: "long" });
    
    return config.fixedBlocks
        .filter(block => {
            // Handle old format for backwards compatibility
                 //used to have recurring to only handle daily blocks in past code
            if (block.recurring !== undefined) {
                return block.recurring; // Old daily blocks
            }
            
            // New format
            if (block.recurrence === "daily") {
                return true;
            }
            
            if (block.recurrence === "weekly") {
                return block.weekDay === todayDayName;
            }
            
            if (block.recurrence === "one-time") {
                return block.date === todayString;
            }
            
            return false;
        })
        .map(block => ({
            name: block.name,
            start: timeToMinutes(block.startTime),
            end: timeToMinutes(block.endTime),
            isFixed: true
        }))
        .sort((a, b) => a.start - b.start);
}

//sort goals by priority and duration
function sortGoalsByPriorityAndDuration(goals) {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    return goals.sort((a, b) => {
        // Sort by priority first
        if (priorityOrder[b.priority] !== priorityOrder[a.priority]) {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        // Then by duration (longest first)
        return b.metric.dailyMinutes - a.metric.dailyMinutes;
    });
}

//schedule a goals task spliting around fixed blocks if needed and returns the new start time and total scheduled minutes so far
//inside a higher a function so array [schedule] is being modified in the higher function 
function scheduleGoalWithSplitting(goal, currentTime, fixedBlocks, schedule) {
    let remainingDuration = goal.metric.dailyMinutes;
    let partNumber = 1;
    let totalScheduled = 0;

     while (remainingDuration > 0) {
        const proposedEnd = currentTime + remainingDuration;

        // Find overlapping fixed block
        const overlappingBlock = fixedBlocks.find(block =>
            currentTime < block.end && proposedEnd >= block.start
        );

        if (overlappingBlock) {
            // Schedule part before the block
            const timeBeforeBlock = overlappingBlock.start - currentTime;

            if (timeBeforeBlock > 0) {
                const task = createTask(goal, currentTime, timeBeforeBlock, partNumber);
                schedule.push(task);
                totalScheduled += timeBeforeBlock;
                remainingDuration -= timeBeforeBlock;
                partNumber++;
            }

            // Add fixed block to schedule
            schedule.push(createFixedBlockEntry(overlappingBlock));

            // Move past the block
            currentTime = overlappingBlock.end;
        } else {
            // No overlap - schedule remaining duration
            const task = createTask(goal, currentTime, remainingDuration, partNumber);
            schedule.push(task);
            totalScheduled += remainingDuration;
            currentTime = currentTime + remainingDuration + BUFFER_MINUTES;
            remainingDuration = 0;
        }
    }

    return {
        newCurrentTime: currentTime,
        minutesScheduled: totalScheduled
    };
}

//Generates today's complete schedule
function generateTodaysSchedule(goals) {
    const config = loadConfig();
    const startTimeMinutes = timeToMinutes(config.startTime);
    const availableMinutes = config.availableHours * 60;

    // Prepare data
    const fixedBlocks = prepareFixedBlocks(config);
    const tasksNeeded = goals.filter(goal => shouldGenerateTaskToday(goal));
    const sortedGoals = sortGoalsByPriorityAndDuration(tasksNeeded);

    // Schedule all goals
    let currentTime = startTimeMinutes;
    const schedule = [];
    let totalMinutes = 0;

    for (const goal of sortedGoals) {
        const result = scheduleGoalWithSplitting(goal, currentTime, fixedBlocks, schedule);
        currentTime = result.newCurrentTime;
        totalMinutes += result.minutesScheduled;
    }

    return {
        tasks: schedule,
        startTime: config.startTime,
        endTime: formatTime(currentTime - BUFFER_MINUTES),
        totalMinutes: totalMinutes,
        availableMinutes: availableMinutes,
        overcommitted: totalMinutes > availableMinutes
    };
}


// ============================================
// SECTION 3: TASK COMPLETION & PROGRESS
// ============================================

//update tasks as complete and update goal metrics
function completeTask(goalId) {
    const goals = loadGoals();
    const goal = goals.find(g => g.id === goalId);

    if (!goal) {
        console.log("Goal not found");
        return false;
    }

    const todayString = new Date().toLocaleDateString("en-CA");


    // Create updated goal for accurate calculations
    const updatedGoal = {
        ...goal,
        metric: {
            ...goal.metric,
            completed: goal.metric.completed + 1
        }
    };

    const progress = calculateProgress(updatedGoal);
    const streak = calculateStreak(goal, todayString);

    const updates = {
        metric: {
            ...goal.metric,
            completed: goal.metric.completed + 1,
            lastCompleted: todayString,
            streak: streak,
            progressPercentage: progress.progressPercentage,
            expectedCompletions: progress.expectedCompletions
        }
    };

    return updateGoal(goalId, updates);
}

//Calculates progress percentage for a goal
function calculateProgress(goal) {
    // One-time tasks: 0% or 100%
    if (goal.frequency === 'one-time') {
        return {
            progressPercentage: goal.metric.completed > 0 ? 100 : 0,
            expectedCompletions: 1
        };
    }

    // Recurring goals: actual vs expected
    const todayInString = new Date().toISOString().split('T')[0];
    const daysSinceCreated = getDaysSince(goal.createdDate, todayInString);

    let expectedCompletions;
    if (goal.frequency === 'daily') {
        expectedCompletions = Math.max(1, daysSinceCreated);
    } else if (goal.frequency === 'weekly') {
        expectedCompletions = Math.max(1, Math.floor(daysSinceCreated / 7));
    }

    const actualCompletions = goal.metric.completed;
    const percentage = Math.round((actualCompletions / expectedCompletions) * 100);

    return {
        progressPercentage: Math.min(percentage, 100),
        expectedCompletions: expectedCompletions
    };
}

//calculate streak for a goal
function calculateStreak(goal, todayString) {
    // One-time tasks don't have streaks
    if (goal.frequency === "one-time") return 0;

    if(!goal.metric.lastCompleted) return 1;


    const daysSinceLastCompleted = getDaysSince(goal.metric.lastCompleted, todayString);

    if (goal.frequency === "daily") {
        // Allow 1 day gap (grace period)
        if(daysSinceLastCompleted <= 1){
             return goal.metric.streak + 1;
          }else{
            return 1;
          }
    }

    if (goal.frequency === "weekly") {
        const weeksSinceLastCompleted = Math.floor(daysSinceLastCompleted / 7);
        // Allow 1 week gap
        if(weeksSinceLastCompleted <= 1){
             return goal.metric.streak + 1;
          }else{
            return 1;
          }
    }
}

// calculates full calendar days between two dates
function getDaysSince(lastCompletedString, todayString) {
    const lastCompleted = new Date(lastCompletedString);
    const today = new Date(todayString);

    // Normalize both dates to local midnight
    lastCompleted.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    return Math.floor((today - lastCompleted) / (1000 * 60 * 60 * 24));
}

// ============================================
// SECTION 4: UTILITY FUNCTIONS
// ============================================

//Converts time string to minutes since midnight
function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

//Converts minutes since midnight to time string
function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

//Formats minutes to 12-hour time string with AM/PM
function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    const displayMins = mins.toString().padStart(2, "0");
    return `${displayHour}:${displayMins} ${period}`;
}

module.exports = {
    // CRUD operations
    loadGoals,
    saveGoals,
    addGoal,
    deleteGoal,
    updateGoal,
    
    // Schedule generation
    shouldGenerateTaskToday,
    generateTodaysSchedule,
    
    // Task completion
    completeTask,
    calculateProgress,
    calculateStreak,
    
    // Utilities
    formatTime,
    timeToMinutes,
    minutesToTime
};