-- SnapLink Core Database Schema

CREATE DATABASE IF NOT EXISTS snaplink_db;
USE snaplink_db;

-- 1. URLs Table
CREATE TABLE IF NOT EXISTS urls (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    short_code VARCHAR(32) NOT NULL UNIQUE,
    original_url TEXT NOT NULL,
    user_id VARCHAR(64) NULL,
    expires_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_short_code (short_code),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional offset so auto-increment numbers start higher (gives 4+ char Base62 codes)
ALTER TABLE urls AUTO_INCREMENT = 100000;

-- 2. Click Events Table (Telemetry / Ingestion)
CREATE TABLE IF NOT EXISTS click_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    short_code VARCHAR(32) NOT NULL,
    ip_hash VARCHAR(64) NOT NULL,
    user_agent VARCHAR(255) NULL,
    referrer VARCHAR(255) NULL,
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_click_short_code (short_code),
    INDEX idx_click_timestamp (short_code, clicked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
