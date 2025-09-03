# ADS_CD_BOT Backend

A secure Telegram Mini App backend for ad reward and lottery system.

## 🚀 Features

- **Ad Reward System**: 4/2/1 points for main/side/low ads
- **Referral Program**: 10 gold points for new users
- **Lottery System**: 100 points = 1 ticket, monthly draws
- **Secure Withdrawals**: Gold points withdrawal with validation
- **Anti-Abuse Protection**: Prevents self-referrals and duplicates
- **Rate Limiting**: Max 100 ads per day per user
- **Automated Draws**: Monthly lottery drawings via cron jobs

## 📊 Database Tables

- `users` - User profiles and balances
- `referrals` - Referral relationships  
- `lottery_tickets` - Lottery ticket purchases
- `ad_views` - Ad viewing history
- `withdrawals` - Withdrawal requests
- `lottery_draws` - Monthly lottery results

## 🔧 Setup

1. **Clone and Install**
