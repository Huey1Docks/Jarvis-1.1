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
                ...config
            };
        }
    } catch(error){
        console.error("Error loading config:", error.message);
    }

    return DEFAULT_CONFIG;
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

function setStartTime(time) {
    // TODO: Validate time format (HH:MM)
    const config = loadConfig();
    config.startTime = time;
    return saveConfig(config);
}

function setAvailableHours(hours) {
    const config = loadConfig();
    config.availableHours = parseInt(hours);
    return saveConfig(config);
}

function addFixedBlock(name, startTime, endTime, recurring = true) {
    let config = loadConfig();

    console.log("DEBUG CONFIG:", config);


    if (!config || typeof config !== 'object') {
        config = {};
    }

    if (!Array.isArray(config.fixedBlocks)) {
        config.fixedBlocks = [];
    }
    
    const block = {
        name: name,
        startTime: startTime,      // "12:00"
        endTime: endTime,          // "13:00"
        recurring: recurring       // true = daily, false = one-time
    };
    
    config.fixedBlocks.push(block);
    return saveConfig(config);
}

function removeFixedBlock(index) {
    const config = loadConfig();
    if (index >= 0 && index < config.fixedBlocks.length) {
        config.fixedBlocks.splice(index, 1);
        return saveConfig(config);
    }
    return false;
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
    listFixedBlocks  
};