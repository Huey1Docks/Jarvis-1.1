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

function addFixedBlock(name, startTime, endTime, recurring = true) {
    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
        return false;
    }

    const config = loadConfig();
    
    const block = {
        name: name,
        startTime: startTime,      // "12:00"
        endTime: endTime,          // "13:00"
        recurring: recurring       // true = daily, false = one-time
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
    isValidTimeFormat  
};