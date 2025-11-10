const fs = require('fs');
const path = require("path");

const CONFIG_FILE = path.join(__dirname, './config.json');


const DEFAULT_CONFIG = {
    startTime: "09:00",
    availableHours: 8,       // 8 hours
    fixedBlocks: []
};

function loadConfig(){
    try{
        if(fs.existsSync(CONFIG_FILE)){
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            const config = JSON.parse(data);
            
            // Merge with defaults to ensure all properties exist
            return {
                ...DEFAULT_CONFIG,
                ...config,

                //fixedBlock will always be an array 

                fixedBlocks: Array.isArray(config.fixedBlocks) ? config.fixedBlocks : []
            };
        }
    } catch(error){
        console.error("Error loading config:", error.message);
    }

    return {...DEFAULT_CONFIG};
}

function saveConfig(config){
    try{
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error("Error saving config:", error.message);
        return false;
    }
}

function isValidTimeFormat(time) {
    return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

function setStartTime(time) {
    
    if(!isValidTimeFormat(time)){
        false;
    }

    const config = loadConfig();
    config.startTime = time;
    return saveConfig(config);
}

function setAvailableHours(hours) {
    const hoursNum = parseInt(hours);
    if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
        return false;
    }

    const config = loadConfig();
    config.availableHours = parseInt(hours);
    return saveConfig(config);
}

//Adds a fixed time block with flexible recurrence
function addFixedBlock(name, startTime, endTime, recurrence, weekDayOrDate) {
    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
        console.log("\n❌ Invalid time format\n");
        return false;
    }

      // Validate recurrence type
    if (!["daily", "weekly", "one-time"].includes(recurrence)) {
        console.log("\n❌ Invalid recurrence. Use: daily, weekly, or one-time\n");
        return false;
    }
    
    // Validate weekly requires weekDay
    if (recurrence === "weekly" && !weekDayOrDate) {
        console.log("\n❌ Weekly blocks require a day (e.g., Monday, Tuesday)\n");
        return false;
    }
    
    // Validate one-time requires date
    if (recurrence === "one-time" && !weekDayOrDate) {
        console.log("\n❌ One-time blocks require a date (YYYY-MM-DD)\n");
        return false;
    }

    const config = loadConfig();
    
    const block = {
        name: name,
        startTime: startTime,
        endTime: endTime,
        recurrence: recurrence,
        weekDay: recurrence === "weekly" ? weekDayOrDate : null,
        date: recurrence === "one-time" ? weekDayOrDate : null
    };
    
    config.fixedBlocks.push(block);
    return saveConfig(config);
}

//remove fixedBlock by index
function removeFixedBlock(index) {
    const config = loadConfig();
    
    if (index < 0 || index >= config.fixedBlocks.length) {
        return false;
    }
    
    config.fixedBlocks.splice(index, 1);
    return saveConfig(config);
}

//Removes one-time blocks that have passed
function cleanupExpiredBlocks() {
    const config = loadConfig();
    const today = new Date().toISOString().split('T')[0];
    
    const initialCount = config.fixedBlocks.length;
    
    config.fixedBlocks = config.fixedBlocks.filter(block => {
        // Keep all non-one-time blocks
        if (block.recurrence !== "one-time") {
            return true;
        }
        
        // Keep one-time blocks that haven't happened yet or are today
        return block.date >= today;
    });
    
    const removedCount = initialCount - config.fixedBlocks.length;
    
    if (removedCount > 0) {
        saveConfig(config);
    }
    
    return removedCount;
}

function listFixedBlocks() {
    const config = loadConfig();
    return config.fixedBlocks;
}

module.exports = {
    loadConfig,
    saveConfig,
    setStartTime,
    setAvailableHours,
    addFixedBlock,        
    removeFixedBlock,     
    listFixedBlocks,
    isValidTimeFormat,
    cleanupExpiredBlocks   
};