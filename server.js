const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const {
    loadGoals,
    generateTodaysSchedule,
    completeTask,
    skipTask,
    addGoal
} = require('./src/goalsManager');
const {
    loadConfig
} = require('./src/configManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'web')));

// ==========================================
// API ENDPOINTS
// ==========================================

// Get all goals
app.get('/api/goals', (req, res) => {
    try {
        const goals = loadGoals();
        res.json(goals);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load goals' });
    }
});

// Get configuration
app.get('/api/config', (req, res) => {
    try {
        const config = loadConfig();
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load config' });
    }
});

// Get today's schedule (pre-calculated on backend)
app.get('/api/schedule', (req, res) => {
    try {
        const goals = loadGoals();
        const schedule = generateTodaysSchedule(goals);
        res.json(schedule);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate schedule' });
    }
});

// Complete a task
app.post('/api/goals/:id/complete', (req, res) => {
    try {
        const goalId = parseInt(req.params.id) || parseFloat(req.params.id); // ids are numbers (Date.now())

        // Handle floating point IDs for one-time tasks or random ID generation overlap
        // The goalsManager uses strictly strict ID matching, but IDs are effectively numbers.

        const success = completeTask(goalId, req.body.score, req.body.reason);

        if (success) {
            res.json({ success: true, message: 'Task completed' });
        } else {
            res.status(404).json({ success: false, message: 'Goal not found or failed to update' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new goal (Basic support for future expansion)
app.post('/api/goals', (req, res) => {
    try {
        const goalData = req.body;
        // Basic validation could go here
        if (!goalData.description) {
            return res.status(400).json({ error: 'Description is required' });
        }

        // Ensure ID is set if not provided
        if (!goalData.id) {
            goalData.id = Date.now();
        }

        const success = addGoal(goalData);
        if (success) {
            res.json({ success: true, message: 'Goal added' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save goal' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Skip a task
app.post('/api/goals/:id/skip', (req, res) => {
    try {
        const goalId = parseInt(req.params.id) || parseFloat(req.params.id);
        const { reason } = req.body;

        const success = skipTask(goalId, reason);

        if (success) {
            res.json({ success: true, message: 'Task skipped' });
        } else {
            res.status(404).json({ success: false, message: 'Goal not found or failed to update' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Jarvis Backend running on http://localhost:${PORT}`);
    console.log(`   Serving files from: ${path.join(__dirname, 'web')}`);
});
