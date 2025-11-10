
const fs = require('fs');
const path = require('path');
const {loadConfig,
     saveConfig,
    setStartTime,
    setAvailableHours } = require('./configManager');
const MEMORY_FILE = path.join(__dirname, './goals.json');


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
            const data = loadGoals();

            const deletedGoal = [];
            const updatedGoals = data.filter(goal => {
                if(goal.id === goalId){
                    deletedGoal.push(goal);
                }
                return goal.id !== goalId;
            });

            saveGoals(updatedGoals);
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
            saveGoals(data);
            return true;
            
        }catch(error){
            console.error("Error updating goal:", error.message);
            return false;
        }
}


//returns false/true if this goal needs a task today
function shouldGenerateTaskToday(goal){
    const todayDate = new Date();
    const dayName = todayDate.toLocaleDateString("en-US", { weekday: "long" });
    const todayString = todayDate.toISOString().split('T')[0];
    

    if(goal.metric.lastCompleted === todayString) {
        return false;
    }

    if(goal.frequency === "daily") {
        return todayString <= goal.targetDate;
    } else if(goal.frequency === "weekly" && goal.weekDay === dayName) {
        return todayString <= goal.targetDate;
    } else if(goal.frequency === "one-time") {
        return todayString >= goal.targetDate;
    }

    return false;
}

//Creates array of task objects for today
//Sorts by priority + duration
//Assigns time slots with 10-min buffer
function generateTodaysSchedule(goals){
    const today = new Date();
    const config = loadConfig();
    const startTimeMinutes = timeToMinutes(config.startTime);
    const availableMinutes = config.availableHours * 60;
    
    // Convert fixed blocks to minutes and sort by start time
    const fixedBlocksInMinutes = config.fixedBlocks
        .filter(block => block.recurring)  // Only daily recurring for now
        .map(block => ({
            name: block.name,
            start: timeToMinutes(block.startTime),
            end: timeToMinutes(block.endTime),
            isFixed: true  // Mark as fixed block
        }))
        .sort((a, b) => a.start - b.start);

    const tasksNeeded = goals.filter(goal => shouldGenerateTaskToday(goal));
    const sortedTasks = tasksNeeded.sort((a,b) => {
        const priorityOrder = { high:3, medium: 2, low: 1};
        if(priorityOrder[b.priority] !== priorityOrder[a.priority]){
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return b.metric.dailyMinutes - a.metric.dailyMinutes;
    });

    let currentTime = startTimeMinutes;
    const schedule = [];
    let totalMinutes = 0;

    for(let goal of sortedTasks){
        let remainingDuration = goal.metric.dailyMinutes;
        let partNumber = 1;
        
        while(remainingDuration > 0) {
            const proposedEnd = currentTime + remainingDuration;
            
            // Find the first fixed block that overlaps with current time slot
            const overlappingBlock = fixedBlocksInMinutes.find(block => 
                currentTime < block.end && proposedEnd >= block.start
            );
            
            if (overlappingBlock) {
                // There's an overlap! Split the task
                
                // Part 1: Schedule what fits BEFORE the block
                const timeBeforeBlock = overlappingBlock.start - currentTime;
                
                if (timeBeforeBlock > 0) {
                    // There's time before the block - schedule a partial task
                    const taskPart = {
                        id: Date.now() + Math.random(),
                        goalId: goal.id,
                        description: remainingDuration === goal.metric.dailyMinutes 
                            ? goal.description 
                            : `${goal.description} (Part ${partNumber})`,
                        startTime: formatTime(currentTime),
                        endTime: formatTime(overlappingBlock.start),
                        duration: timeBeforeBlock,
                        priority: goal.priority,
                        completed: false,
                        isPart: remainingDuration !== goal.metric.dailyMinutes
                    };
                    
                    schedule.push(taskPart);
                    totalMinutes += timeBeforeBlock;
                    remainingDuration -= timeBeforeBlock;
                    partNumber++;
                }
                
                // Add the fixed block to the schedule (for display)
                const blockEntry = {
                    id: `block_${overlappingBlock.name}`,
                    description: `🔒 ${overlappingBlock.name}`,
                    startTime: formatTime(overlappingBlock.start),
                    endTime: formatTime(overlappingBlock.end),
                    duration: overlappingBlock.end - overlappingBlock.start,
                    isFixed: true,
                    priority: 'FIXED'
                };
                schedule.push(blockEntry);
                
                // Move current time to AFTER the block
                currentTime = overlappingBlock.end;
                
            } else {
                // No overlap - schedule the remaining task normally
                const task = {
                    id: Date.now() + Math.random(),
                    goalId: goal.id,
                    description: partNumber > 1 
                        ? `${goal.description} (Part ${partNumber})` 
                        : goal.description,
                    startTime: formatTime(currentTime),
                    endTime: formatTime(currentTime + remainingDuration),
                    duration: remainingDuration,
                    priority: goal.priority,
                    completed: false,
                    isPart: partNumber > 1
                };
                
                schedule.push(task);
                totalMinutes += remainingDuration;
                currentTime = currentTime + remainingDuration + 10;  // Add buffer
                remainingDuration = 0;  // Task is complete
            }
        }
    }
    
    return {
        tasks: schedule,
        startTime: config.startTime,
        endTime: formatTime(currentTime - 10),
        totalMinutes: totalMinutes,
        availableMinutes: availableMinutes,
        overcommitted: totalMinutes > availableMinutes
    };
}

//got the help of chatGPT for the following
function formatTime(minutes){
    const hours = Math.floor(minutes/60);
    const mins = minutes % 60;

    const amORpm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;

    const displayMins = mins.toString().padStart(2, "0");
    return `${displayHour}:${displayMins} ${amORpm}`;
}

//Updates goal's lastCompleted and increments completed counter
function completeTask(goalId){
    const goals = loadGoals();
    const goal = goals.find(g => g.id === goalId);

    if(!goal) {
        console.log("Goal not found");
        return false;
    }

    const todayString = new Date().toISOString().split('T')[0];
    

      // Create temporary updated goal for calculation
    const updatedGoal = {
        ...goal,
        metric: {
            ...goal.metric,
            completed: goal.metric.completed + 1  // Increment FIRST
        }
    };
   

    const progress = calculateProgress(updatedGoal);  // calculate new progress for goal
    const streak = calculateStreak(goal, todayString);
    
    const needToUpdate = {
        metric: {
            ...goal.metric,  // Keep existing metric values
            completed: goal.metric.completed + 1,
            lastCompleted: todayString,
            streak: streak,
            progressPercentage: progress.progressPercentage,      
            expectedCompletions: progress.expectedCompletions 
        }
    };
    
   
   return updateGoal(goalId, needToUpdate);
  
}

function calculateProgress(goal) {
    if (goal.frequency === 'one-time') {
        return {
            progressPercentage: goal.metric.completed > 0 ? 100 : 0,
            expectedCompletions: 1
        };
    }
    
    const today = new Date();
    const createdDate = new Date(goal.createdDate);
    const daysSinceCreated = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
    
    let expectedCompletions;
    if (goal.frequency === 'daily') {
        expectedCompletions = Math.max(1, daysSinceCreated);  // ✅ Minimum of 1!
    } else if (goal.frequency === 'weekly') {
        expectedCompletions = Math.max(1, Math.floor(daysSinceCreated / 7));  // ✅ Minimum of 1!
    }
    
    // Remove the "edge case" check - we always have at least 1 expected now
    
    const actualCompletions = goal.metric.completed;
    const percentage = Math.round((actualCompletions / expectedCompletions) * 100);
    
    return {
        progressPercentage: Math.min(percentage, 100),
        expectedCompletions: expectedCompletions
    };
}

function calculateStreak(goal, todayString){
    if(goal.frequency === "one-time") return 0;

    if(!goal.metric.lastCompleted) return 1;


    const lastCompleted = new Date(goal.metric.lastCompleted);
    const today = new Date(todayString);
    const daysSinceLastCompleted = Math.floor((today - lastCompleted) / (1000 * 60 * 60 * 24));

    if(goal.frequency === "daily"){
        //allow 1 day gap for help in consistency for user
        if(daysSinceLastCompleted <= 1){
            return goal.metric.streak + 1;
        } else {
            return 1;
        }
    }

    if(goal.frequency === "weekly"){

        const weeksSinceLastCompleted = Math.floor(daysSinceLastCompleted / 7);
        //allow 1 week gap
        if(weeksSinceLastCompleted <= 1){
            return goal.metric.streak + 1;
        } else {
            return 1;
        }
    }

    return 1;
}

//time conversion functions between config and schedule
function timeToMinutes(timeString) {
    // "09:00" → 540 minutes
    // "13:30" → 810 minutes
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    // 540 → "09:00"
    // 810 → "13:30"
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}



module.exports = {
    loadGoals,
    saveGoals,
    addGoal,
    deleteGoal,
    updateGoal,
    shouldGenerateTaskToday,      
    generateTodaysSchedule,       
    completeTask,                
    formatTime,
    calculateProgress,
    calculateStreak,
    timeToMinutes,
    minutesToTime
}