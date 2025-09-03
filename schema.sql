-- Users table
CREATE TABLE users (
    user_id BIGINT PRIMARY KEY,
    username VARCHAR(100),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    normal_points INTEGER DEFAULT 0,
    gold_points INTEGER DEFAULT 10,
    total_ads_watched INTEGER DEFAULT 0,
    referrer_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Referrals table
CREATE TABLE referrals (
    id SERIAL PRIMARY KEY,
    referrer_id BIGINT NOT NULL,
    referred_id BIGINT NOT NULL,
    reward_credited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referrer_id) REFERENCES users(user_id),
    FOREIGN KEY (referred_id) REFERENCES users(user_id)
);

-- Lottery tickets table
CREATE TABLE lottery_tickets (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    draw_id INTEGER DEFAULT 1,
    ticket_count INTEGER DEFAULT 1,
    points_spent INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Ad views tracking
CREATE TABLE ad_views (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    ad_type VARCHAR(20) NOT NULL,
    points_earned INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Withdrawals table
CREATE TABLE withdrawals (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount INTEGER NOT NULL,
    withdrawal_method VARCHAR(50),
    wallet_address VARCHAR(200),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Monthly lottery draws
CREATE TABLE lottery_draws (
    id SERIAL PRIMARY KEY,
    draw_month VARCHAR(7) NOT NULL, -- Format: '2025-09'
    total_tickets INTEGER NOT NULL,
    total_participants INTEGER NOT NULL,
    winners JSONB NOT NULL, -- Array of winner objects
    draw_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'completed'
);

-- Indexes for better performance
CREATE INDEX idx_users_referrer ON users(referrer_id);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_lottery_tickets_user ON lottery_tickets(user_id);
CREATE INDEX idx_ad_views_user_date ON ad_views(user_id, created_at);
CREATE INDEX idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX idx_lottery_draws_month ON lottery_draws(draw_month);
