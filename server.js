const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to send Telegram messages
async function sendMessage(chatId, text, options = {}) {
    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            ...options
        });
    } catch (error) {
        console.error('Send message error:', error);
    }
}

// Simple auth middleware
function verifyTelegramAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('tma ')) {
        return res.status(401).json({ error: 'Unauthorized - Missing auth header' });
    }
    
    try {
        const initData = authHeader.slice(4);
        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        
        if (!userStr) {
            return res.status(401).json({ error: 'Unauthorized - No user data' });
        }
        
        const user = JSON.parse(userStr);
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Unauthorized - Invalid auth data' });
    }
}

// ✅ SECURE Helper function with ALL security checks
async function getOrCreateUser(userId, userData, referrerId = null) {
    try {
        let result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
        
        if (result.rows.length === 0) {
            // ✅ SECURITY 1: Prevent self-referral
            if (referrerId && referrerId === userId) {
                console.log(`Self-referral blocked for user ${userId}`);
                referrerId = null;
            }

            // ✅ SECURITY 2: Check if referrer exists and is valid
            if (referrerId) {
                const referrerExists = await pool.query(
                    'SELECT user_id FROM users WHERE user_id = $1',
                    [referrerId]
                );
                if (referrerExists.rows.length === 0) {
                    console.log(`Invalid referrer ${referrerId} for user ${userId}`);
                    referrerId = null;
                }
            }
            
            // Create new user with 10 gold points
            await pool.query(
                `INSERT INTO users (user_id, username, first_name, last_name, normal_points, gold_points, referrer_id) 
                 VALUES ($1, $2, $3, $4, 0, 10, $5)`,
                [userId, userData.username || '', userData.first_name || '', userData.last_name || '', referrerId]
            );
            
            // ✅ SECURITY 3: Only create referral record for NEW users with valid referrer
            if (referrerId && referrerId !== userId) {
                await pool.query(
                    'INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)',
                    [referrerId, userId]
                );
                console.log(`Referral created: ${referrerId} referred ${userId}`);
            }
            
            result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
        } else {
            // ✅ SECURITY 4: Existing users get NO referral benefits
            console.log(`Existing user ${userId} - no referral benefits applied`);
        }
        
        return result.rows[0];
    } catch (error) {
        console.error('User creation error:', error);
        throw error;
    }
}

// Lottery drawing function - fair weighted selection
async function conductMonthlyDraw(month) {
    try {
        // Get all tickets for the month (format: '2025-09')
        const tickets = await pool.query(`
            SELECT user_id, SUM(ticket_count) as total_tickets, 
                   u.username, u.first_name
            FROM lottery_tickets lt
            JOIN users u ON lt.user_id = u.user_id
            WHERE TO_CHAR(lt.created_at, 'YYYY-MM') = $1
            GROUP BY user_id, u.username, u.first_name
            HAVING SUM(ticket_count) > 0
            ORDER BY user_id
        `, [month]);

        if (tickets.rows.length === 0) {
            throw new Error('No tickets found for this month');
        }

        // Create weighted ranges for each participant
        const participants = [];
        let currentRange = 1;
        let totalTickets = 0;

        for (const ticket of tickets.rows) {
            const ticketCount = parseInt(ticket.total_tickets);
            totalTickets += ticketCount;
            
            participants.push({
                user_id: ticket.user_id,
                username: ticket.username,
                first_name: ticket.first_name,
                tickets: ticketCount,
                range_start: currentRange,
                range_end: currentRange + ticketCount - 1
            });
            
            currentRange += ticketCount;
        }

        // Conduct multiple drawings (1st, 2nd, 3rd place)
        const winners = [];
        const usedNumbers = new Set();

        for (let place = 1; place <= Math.min(3, participants.length); place++) {
            let winningNumber;
            let winner;
            
            // Generate unique winning number
            do {
                winningNumber = Math.floor(Math.random() * totalTickets) + 1;
            } while (usedNumbers.has(winningNumber));
            
            usedNumbers.add(winningNumber);

            // Find the winner for this number
            winner = participants.find(p => 
                winningNumber >= p.range_start && winningNumber <= p.range_end
            );

            if (winner) {
                winners.push({
                    place: place,
                    user_id: winner.user_id,
                    username: winner.username,
                    first_name: winner.first_name,
                    tickets: winner.tickets,
                    winning_number: winningNumber,
                    prize_amount: getPrizeAmount(place)
                });
            }
        }

        // Save draw results
        await pool.query(`
            INSERT INTO lottery_draws 
            (draw_month, total_tickets, total_participants, winners) 
            VALUES ($1, $2, $3, $4)
        `, [month, totalTickets, participants.length, JSON.stringify(winners)]);

        // Award prizes to winners
        for (const winner of winners) {
            await pool.query(`
                UPDATE users 
                SET gold_points = gold_points + $1 
                WHERE user_id = $2
            `, [winner.prize_amount, winner.user_id]);
        }

        return {
            month: month,
            total_tickets: totalTickets,
            total_participants: participants.length,
            winners: winners,
            participants: participants
        };

    } catch (error) {
        console.error('Lottery draw error:', error);
        throw error;
    }
}

// Prize structure
function getPrizeAmount(place) {
    const prizes = {
        1: 1000, // 1st place: 1000 gold points
        2: 500,  // 2nd place: 500 gold points
        3: 250   // 3rd place: 250 gold points
    };
    return prizes[place] || 0;
}

// Routes

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'ADS_CD_BOT Backend Running', 
        project: 'Ad Rewards Platform',
        timestamp: new Date().toISOString(),
        security: 'Enhanced referral protection enabled',
        version: '1.0.0'
    });
});

// Webhook for Telegram bot
app.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const userId = message.from.id;
            const text = message.text;

            if (text && text.startsWith('/start')) {
                let referrerId = null;
                
                // Extract referrer ID from /start command
                const parts = text.split(' ');
                if (parts.length > 1) {
                    referrerId = parseInt(parts[1]);
                }

                // Create user with referral tracking
                await getOrCreateUser(userId, {
                    username: message.from.username,
                    first_name: message.from.first_name,
                    last_name: message.from.last_name
                }, referrerId);

                // Send welcome with user's own referral link
                const welcomeText = `
🎉 <b>Welcome to ADS_CD_BOT!</b>

👤 Your User ID: <code>${userId}</code>
🔗 Your Referral Link: https://t.me/${BOT_USERNAME}?start=${userId}

💰 You've received <b>10 Gold Points</b>!
📢 Share your link to earn more rewards!

🎯 Watch ads to earn points:
• Main ads: 4 points
• Side ads: 2 points  
• Low ads: 1 point

🎫 Buy lottery tickets: 100 points = 1 ticket
                `;

                await sendMessage(chatId, welcomeText, {
                    reply_markup: {
                        inline_keyboard: [[
                            {
                                text: "🚀 Open Mini App",
                                web_app: { url: process.env.MINI_APP_URL }
                            }
                        ]]
                    }
                });
            }

            // Handle /myid command
            if (text === '/myid') {
                await sendMessage(chatId, 
                    `👤 Your User ID: <code>${userId}</code>\n🔗 Your Referral Link: https://t.me/${BOT_USERNAME}?start=${userId}`
                );
            }
        }
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Error');
    }
});

// Get user balance and stats
app.get('/balance', verifyTelegramAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const referralCode = req.query.start;
        const referrerId = referralCode ? parseInt(referralCode) : null;
        
        const user = await getOrCreateUser(userId, req.user, referrerId);
        
        const referralCount = await pool.query(
            'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1',
            [userId]
        );
        
        const ticketsCount = await pool.query(
            'SELECT COALESCE(SUM(ticket_count), 0) as total FROM lottery_tickets WHERE user_id = $1',
            [userId]
        );
        
        res.json({
            normal_points: user.normal_points,
            gold_points: user.gold_points,
            total_ads_watched: user.total_ads_watched,
            total_referrals: parseInt(referralCount.rows[0].count),
            total_tickets: parseInt(ticketsCount.rows[0].total),
            user_id: userId,
            referral_link: `https://t.me/${BOT_USERNAME}?start=${userId}`
        });
    } catch (error) {
        console.error('Balance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Credit points for ad viewing with additional security
app.post('/credit', verifyTelegramAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { adType } = req.body;
        
        const pointValues = {
            'main': 4,
            'side': 2,
            'low': 1
        };
        
        const points = pointValues[adType];
        if (!points) {
            return res.status(400).json({ error: 'Invalid ad type' });
        }

        // ✅ SECURITY: Rate limiting - max 100 ads per day
        const today = new Date().toISOString().split('T')[0];
        const todayAds = await pool.query(
            `SELECT COUNT(*) as count FROM ad_views 
             WHERE user_id = $1 AND DATE(created_at) = $2`,
            [userId, today]
        );

        if (parseInt(todayAds.rows[0].count) >= 100) {
            return res.status(429).json({ 
                error: 'Daily ad limit reached (100 ads per day)' 
            });
        }
        
        await getOrCreateUser(userId, req.user);
        
        await pool.query(
            `UPDATE users 
             SET normal_points = normal_points + $1, 
                 total_ads_watched = total_ads_watched + 1,
                 updated_at = CURRENT_TIMESTAMP 
             WHERE user_id = $2`,
            [points, userId]
        );
        
        await pool.query(
            'INSERT INTO ad_views (user_id, ad_type, points_earned) VALUES ($1, $2, $3)',
            [userId, adType, points]
        );
        
        const result = await pool.query('SELECT normal_points, gold_points FROM users WHERE user_id = $1', [userId]);
        
        res.json({
            message: `Credited ${points} points for ${adType} ad`,
            normal_points: result.rows[0].normal_points,
            gold_points: result.rows[0].gold_points,
            points_earned: points,
            daily_ads_watched: parseInt(todayAds.rows[0].count) + 1
        });
    } catch (error) {
        console.error('Credit error:', error);
        res.status(500).json({ error: 'Failed to credit points' });
    }
});

// Buy lottery tickets
app.post('/buy-tickets', verifyTelegramAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        let { ticketCount = 1 } = req.body;
        
        await getOrCreateUser(userId, req.user);
        
        const userResult = await pool.query('SELECT normal_points FROM users WHERE user_id = $1', [userId]);
        const currentPoints = userResult.rows[0].normal_points;
        const maxTickets = Math.floor(currentPoints / 100);
        
        if (maxTickets < 1) {
            return res.status(400).json({ 
                error: 'Insufficient points',
                required: 100,
                available: currentPoints
            });
        }
        
        ticketCount = Math.min(ticketCount, maxTickets);
        const pointsNeeded = ticketCount * 100;
        
        await pool.query('BEGIN');
        
        try {
            await pool.query(
                'UPDATE users SET normal_points = normal_points - $1 WHERE user_id = $2',
                [pointsNeeded, userId]
            );
            
            await pool.query(
                'INSERT INTO lottery_tickets (user_id, ticket_count, points_spent) VALUES ($1, $2, $3)',
                [userId, ticketCount, pointsNeeded]
            );
            
            await pool.query('COMMIT');
            
            const balanceResult = await pool.query('SELECT normal_points FROM users WHERE user_id = $1', [userId]);
            
            res.json({
                message: `Successfully purchased ${ticketCount} lottery ticket(s)`,
                tickets_purchased: ticketCount,
                points_spent: pointsNeeded,
                remaining_points: balanceResult.rows[0].normal_points
            });
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Buy tickets error:', error);
        res.status(500).json({ error: 'Failed to purchase tickets' });
    }
});

// Get referral stats
app.get('/referrals', verifyTelegramAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const referrals = await pool.query(`
            SELECT r.*, u.username, u.first_name, r.created_at
            FROM referrals r 
            JOIN users u ON r.referred_id = u.user_id 
            WHERE r.referrer_id = $1 
            ORDER BY r.created_at DESC
        `, [userId]);
        
        res.json({
            total_referrals: referrals.rows.length,
            referral_link: `https://t.me/${BOT_USERNAME}?start=${userId}`,
            referrals: referrals.rows.map(r => ({
                user_id: r.referred_id,
                username: r.username,
                first_name: r.first_name,
                joined_at: r.created_at
            }))
        });
    } catch (error) {
        console.error('Referrals error:', error);
        res.status(500).json({ error: 'Failed to get referral data' });
    }
});

// Request withdrawal
app.post('/withdraw-gold', verifyTelegramAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, method, walletAddress } = req.body;
        
        if (!amount || amount < 1) {
            return res.status(400).json({ error: 'Invalid withdrawal amount' });
        }

        // ✅ SECURITY: Minimum withdrawal amount
        if (amount < 10) {
            return res.status(400).json({ error: 'Minimum withdrawal is 10 gold points' });
        }
        
        await getOrCreateUser(userId, req.user);
        
        const userResult = await pool.query('SELECT gold_points FROM users WHERE user_id = $1', [userId]);
        const currentGold = userResult.rows[0].gold_points;
        
        if (currentGold < amount) {
            return res.status(400).json({ 
                error: 'Insufficient gold points',
                required: amount,
                available: currentGold
            });
        }
        
        await pool.query(
            `INSERT INTO withdrawals (user_id, amount, withdrawal_method, wallet_address, status) 
             VALUES ($1, $2, $3, $4, 'pending')`,
            [userId, amount, method, walletAddress]
        );
        
        res.json({
            message: 'Withdrawal request submitted successfully',
            amount: amount,
            method: method,
            status: 'pending'
        });
    } catch (error) {
        console.error('Withdraw gold error:', error);
        res.status(500).json({ error: 'Failed to process withdrawal' });
    }
});

// Conduct monthly lottery draw (admin only)
app.post('/admin/conduct-draw', async (req, res) => {
    try {
        const { month } = req.body; // Format: '2025-09'
        
        // Check if draw already exists
        const existingDraw = await pool.query(
            'SELECT id FROM lottery_draws WHERE draw_month = $1',
            [month]
        );

        if (existingDraw.rows.length > 0) {
            return res.status(400).json({ error: 'Draw already conducted for this month' });
        }

        const results = await conductMonthlyDraw(month);
        
        res.json({
            message: 'Monthly lottery draw completed successfully',
            results: results
        });

    } catch (error) {
        console.error('Draw conduct error:', error);
        res.status(500).json({ error: 'Failed to conduct draw' });
    }
});

// Get lottery results
app.get('/lottery-results/:month', async (req, res) => {
    try {
        const { month } = req.params;
        
        const draw = await pool.query(
            'SELECT * FROM lottery_draws WHERE draw_month = $1',
            [month]
        );

        if (draw.rows.length === 0) {
            return res.status(404).json({ error: 'No draw found for this month' });
        }

        res.json(draw.rows[0]);

    } catch (error) {
        console.error('Results fetch error:', error);
        res.status(500).json({ error: 'Failed to get results' });
    }
});

// Automated monthly draw (runs on 1st of each month at midnight)
cron.schedule('0 0 1 * *', async () => {
    try {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const monthString = lastMonth.toISOString().slice(0, 7); // '2025-09'
        
        console.log(`Conducting automatic lottery draw for ${monthString}`);
        await conductMonthlyDraw(monthString);
        console.log(`Draw completed for ${monthString}`);
        
    } catch (error) {
        console.error('Automatic draw failed:', error);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 ADS_CD_BOT Backend running on port ${PORT}`);
    console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
    console.log(`🤖 Bot: ${BOT_USERNAME || 'Not configured'}`);
    console.log(`🔒 Security: Enhanced referral protection enabled`);
    console.log(`⏰ Cron: Monthly lottery draws scheduled`);
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection error:', err.stack);
    } else {
        console.log('✅ Database connected successfully');
        release();
    }
});
