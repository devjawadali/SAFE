# SafeRide Women - Deployment Guide

Complete deployment guide for the SafeRide Women backend server.

---

## Table of Contents

- [Overview](#overview)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Platform-Specific Deployment](#platform-specific-deployment)
- [SSL/TLS Setup](#ssltls-setup)
- [Process Management](#process-management)
- [Monitoring & Logging](#monitoring--logging)
- [Maintenance](#maintenance)
- [Scaling](#scaling)
- [Rollback](#rollback)
- [Post-Deployment Verification](#post-deployment-verification)
- [Troubleshooting](#troubleshooting)
- [Backup & Disaster Recovery](#backup--disaster-recovery)
- [Cost Optimization](#cost-optimization)

---

## Overview

The SafeRide Women backend is a Node.js application built with Express.js and Socket.io. This guide covers deployment to various platforms including Heroku, Render, Railway, AWS, DigitalOcean, and Docker.

### System Requirements

- **Node.js**: 16+ (LTS recommended)
- **PostgreSQL**: 12+ (for production database)
- **Memory**: Minimum 512MB, recommended 1GB+
- **CPU**: 1+ core
- **Storage**: 10GB+ for logs and database

---

## Pre-Deployment Checklist

### Code Preparation

- [ ] All code committed to version control
- [ ] Environment variables documented in `.env.example`
- [ ] Database migrations tested locally
- [ ] All tests passing
- [ ] Security vulnerabilities addressed
- [ ] Dependencies updated and locked
- [ ] Build scripts verified

### Configuration

- [ ] Production environment variables configured
- [ ] Database connection string verified
- [ ] CORS origins configured for production
- [ ] JWT secrets rotated and secured
- [ ] Sentry DSN configured
- [ ] SSL/TLS certificates obtained

### Security

- [ ] Strong JWT_SECRET generated
- [ ] CORS_ORIGIN restricted to production domains
- [ ] Database credentials secured
- [ ] API rate limits reviewed
- [ ] Security headers configured (Helmet)
- [ ] Environment variables never committed

---

## Environment Variables

### Required Variables

```env
# Server Configuration
PORT=4000
NODE_ENV=production

# Database Configuration
DATABASE_URL=postgresql://user:password@host:5432/saferide_db
# OR use individual parameters:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=saferide_db
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_SSL=true  # Set to false for local development

# Authentication
JWT_SECRET=your-very-secure-random-secret-key-minimum-32-characters
ACCESS_TOKEN_EXPIRY=30m  # Access token expiration (e.g., 15m, 30m, 1h)
REFRESH_TOKEN_EXPIRY_DAYS=7  # Refresh token expiration in days (7-30)

# Security
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# Error Tracking (Optional but recommended)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_RELEASE=saferide-backend@1.0.0

# Socket.io (Optional)
SOCKET_TRANSPORTS=websocket,polling
```

### Variable Descriptions

**PORT**: Server listening port (default: 4000)

**NODE_ENV**: Environment mode (`production` or `development`)

**DATABASE_URL**: PostgreSQL connection string. Format: `postgresql://user:password@host:port/database`

**DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD**: Alternative to DATABASE_URL for individual database parameters

**DB_SSL**: Enable SSL for database connections (required for production, set to `false` for local)

**JWT_SECRET**: Secret key for JWT signing. **MUST** be a strong random string (32+ characters)

**ACCESS_TOKEN_EXPIRY**: Access token expiration time (e.g., `30m`, `1h`)

**REFRESH_TOKEN_EXPIRY_DAYS**: Refresh token expiration in days (7-30 recommended)

**CORS_ORIGIN**: Comma-separated list of allowed origins for CORS

**SENTRY_DSN**: Sentry error tracking DSN (optional but recommended for production)

**SENTRY_RELEASE**: Release version for Sentry tracking

**SOCKET_TRANSPORTS**: Socket.io transport methods (default: `websocket,polling`)

### Security Notes

- **Never commit `.env` files to version control**
- Use different secrets for each environment
- Rotate secrets periodically
- Use environment variable management tools (AWS Secrets Manager, HashiCorp Vault, etc.)
- Enable SSL/TLS for all production connections

---

## Database Setup

### PostgreSQL Installation

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS (Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Windows:**
Download from https://www.postgresql.org/download/windows/

### Database Creation

```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Create database
CREATE DATABASE saferide_db;

# Create user (optional, for dedicated user)
CREATE USER saferide_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE saferide_db TO saferide_user;

# Exit
\q
```

### Schema Setup

```bash
# Run schema script
psql -U postgres -d saferide_db -f db/schema.sql

# Run seed data (optional, for development)
psql -U postgres -d saferide_db -f db/seed.sql
```

Or use the npm script:
```bash
npm run db:setup
```

### Database Migrations

If using migrations:
```bash
npm run db:migrate
```

#### Gender constraint migration strategy (female-only)

To safely transition existing data where some rows may have `gender = 'woman'` or `NULL`:

1. Deploy the backend application code first (which accepts only `female` and rejects `male`, with trimming on input).
2. Run the migration that drops and re-adds the gender check constraint as NOT VALID:
   - `db/migrations/002_update_gender_constraint.sql`:
     - `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_gender_check;`
     - `ALTER TABLE users ADD CONSTRAINT users_gender_check CHECK (LOWER(gender) = 'female') NOT VALID;`
   This ensures existing rows are not immediately revalidated.
3. Optionally normalize data over time (or via a separate job) so any legacy values (e.g., `woman`) are either unchanged or migrated as needed.
4. Enforce NOT NULL on `gender` (defense-in-depth):
   - Run `db/migrations/003_enforce_gender_not_null.sql` which first sets `gender = 'female'` where it is NULL, then adds `NOT NULL` to the column.
5. After verifying on staging and ensuring production data is compatible, you may validate the constraint in a controlled window:
   ```sql
   ALTER TABLE users VALIDATE CONSTRAINT users_gender_check;
   ```

Notes:
- The schema in `db/schema.sql` reflects the final desired state (`CHECK (LOWER(gender) = 'female')` and `NOT NULL`) but production rollout must follow the steps above to avoid revalidation failures.

### Connection Pooling

The application uses connection pooling. Configure in `config/database.js`:
- `max`: Maximum connections (default: 20)
- `idleTimeoutMillis`: Idle connection timeout (default: 30000ms)
- `connectionTimeoutMillis`: Connection timeout (default: 10000ms)

---

## Platform-Specific Deployment

### Heroku

#### Setup

```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Create app
heroku create saferide-backend

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:hobby-dev

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret-key
heroku config:set CORS_ORIGIN=https://yourdomain.com
heroku config:set SENTRY_DSN=your-sentry-dsn
heroku config:set ACCESS_TOKEN_EXPIRY=30m
heroku config:set REFRESH_TOKEN_EXPIRY_DAYS=7

# Deploy
git push heroku main
```

#### Database Setup

```bash
# Run migrations
heroku run npm run db:setup

# Or connect directly
heroku pg:psql
```

#### Process Management

Heroku handles process management automatically. Use `Procfile`:
```
web: node server.js
```

#### Scaling

```bash
# Scale dynos
heroku ps:scale web=2

# Check status
heroku ps
```

### Render

#### Setup

1. Connect GitHub repository to Render
2. Create new Web Service
3. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Environment**: `Node`

#### Database Setup

1. Create PostgreSQL database on Render
2. Copy database URL
3. Set environment variables:
   - `DATABASE_URL`: (auto-provided by Render)
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: (your secret)
   - `CORS_ORIGIN`: (your domain)
   - `SENTRY_DSN`: (your Sentry DSN)

#### SSL/TLS

Render provides automatic SSL/TLS certificates.

### Railway

#### Setup

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add PostgreSQL
railway add postgresql

# Set environment variables
railway variables set NODE_ENV=production
railway variables set JWT_SECRET=your-secret
railway variables set CORS_ORIGIN=https://yourdomain.com

# Deploy
railway up
```

#### Database Setup

```bash
# Connect to database
railway connect postgresql

# Run migrations
railway run npm run db:setup
```

### AWS (EC2/ECS)

#### EC2 Deployment

**Prerequisites:**
- AWS account
- EC2 instance (Ubuntu recommended)
- Security groups configured

**Setup:**

```bash
# SSH into instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Clone repository
git clone https://github.com/your-repo/saferide-backend.git
cd saferide-backend

# Install dependencies
npm install --production

# Set environment variables
nano .env
# (Add all required variables)

# Run database setup
npm run db:setup

# Start with PM2 (see Process Management section)
pm2 start server.js --name saferide-backend
pm2 save
pm2 startup
```

**Security Groups:**
- Port 22 (SSH)
- Port 4000 (HTTP) - or configure reverse proxy
- Port 443 (HTTPS)

### DigitalOcean (Droplet)

#### Setup

1. Create Droplet (Ubuntu 22.04 recommended)
2. Follow EC2 setup steps above
3. Configure firewall:
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

#### App Platform

1. Create new App on DigitalOcean
2. Connect GitHub repository
3. Configure:
   - **Build Command**: `npm install`
   - **Run Command**: `node server.js`
   - Add PostgreSQL database
   - Set environment variables

### Docker

#### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port
EXPOSE 4000

# Start application
CMD ["node", "server.js"]
```

#### Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/saferide_db
      - JWT_SECRET=${JWT_SECRET}
      - CORS_ORIGIN=${CORS_ORIGIN}
      - SENTRY_DSN=${SENTRY_DSN}
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=saferide_db
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

#### Build and Run

```bash
# Build
docker-compose build

# Run
docker-compose up -d

# Run database setup
docker-compose exec app npm run db:setup

# View logs
docker-compose logs -f app
```

---

## SSL/TLS Setup

### Using Let's Encrypt (Certbot)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate (with Nginx)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal (already configured by Certbot)
sudo certbot renew --dry-run
```

### Using Cloudflare

1. Add domain to Cloudflare
2. Update nameservers
3. Enable SSL/TLS: Full (strict)
4. Configure SSL certificates in Cloudflare dashboard

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Process Management

### PM2

#### Installation

```bash
npm install -g pm2
```

#### Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'saferide-backend',
    script: 'server.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G'
  }]
};
```

#### Commands

```bash
# Start application
pm2 start ecosystem.config.js

# Start with specific environment
pm2 start ecosystem.config.js --env production

# Monitor
pm2 monit

# View logs
pm2 logs saferide-backend

# Restart
pm2 restart saferide-backend

# Stop
pm2 stop saferide-backend

# Save process list
pm2 save

# Setup startup script
pm2 startup
pm2 save
```

---

## Monitoring & Logging

### Sentry Integration

Sentry is automatically configured when `SENTRY_DSN` is set. Monitor errors at your Sentry dashboard.

### Application Logs

Logs are output via Pino logger. Configure log levels:

```env
LOG_LEVEL=info  # Options: trace, debug, info, warn, error, fatal
```

### Health Check Endpoint

Monitor application health:
```bash
curl https://yourdomain.com/api/health
```

### Database Monitoring

Monitor PostgreSQL:
```bash
# Connection stats
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Database size
psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('saferide_db'));"
```

### System Monitoring

Use tools like:
- **New Relic**: Application Performance Monitoring
- **Datadog**: Infrastructure monitoring
- **Grafana + Prometheus**: Metrics and dashboards

---

## Maintenance

### Regular Tasks

**Daily:**
- Check application logs for errors
- Monitor Sentry for critical issues
- Verify health check endpoint

**Weekly:**
- Review database performance
- Check disk space usage
- Review security logs

**Monthly:**
- Update dependencies (`npm audit`)
- Review and rotate secrets
- Backup verification
- Performance optimization review

### Database Maintenance

```bash
# Vacuum database
psql -U postgres -d saferide_db -c "VACUUM ANALYZE;"

# Check for dead tuples
psql -U postgres -d saferide_db -c "SELECT schemaname, tablename, n_dead_tup, n_live_tup FROM pg_stat_user_tables;"
```

---

## Scaling

### Horizontal Scaling

1. **Load Balancer**: Use nginx, HAProxy, or cloud load balancer
2. **Multiple Instances**: Deploy multiple app instances
3. **Session Management**: Use Redis adapter for Socket.io
4. **Database**: Use connection pooling and read replicas

### Vertical Scaling

Increase instance resources:
- More CPU cores
- More RAM
- Faster storage

### Database Scaling

- Connection pooling (already configured)
- Read replicas for read-heavy workloads
- Database sharding (advanced)

---

## Rollback

### Application Rollback

**Git-based:**
```bash
# Revert to previous commit
git revert HEAD
git push origin main
```

**Platform-specific:**
- **Heroku**: `heroku rollback v123`
- **Render**: Use dashboard to rollback
- **Railway**: `railway rollback`

### Database Rollback

```bash
# Restore from backup
pg_restore -U postgres -d saferide_db backup.dump
```

---

## Post-Deployment Verification

### Checklist

- [ ] Health check endpoint returns `200 OK`
- [ ] Database connection successful
- [ ] Authentication endpoints working
- [ ] Socket.io connections successful
- [ ] SSL/TLS certificates valid
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] Logs being generated
- [ ] Sentry error tracking active
- [ ] Rate limiting working
- [ ] All API endpoints accessible

### Test Commands

```bash
# Health check
curl https://yourdomain.com/api/health

# Test authentication
curl -X POST https://yourdomain.com/api/auth/otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+1234567890"}'

# Test Socket.io (use client library)
```

---

## Troubleshooting

### Application Won't Start

**Check logs:**
```bash
# PM2 logs
pm2 logs saferide-backend

# Docker logs
docker-compose logs app

# System logs
journalctl -u saferide-backend -f
```

**Common issues:**
- Port already in use: Change PORT or kill process
- Database connection failed: Check DATABASE_URL
- Missing environment variables: Verify .env file

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Check connection pool
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname='saferide_db';"
```

### High Memory Usage

- Enable PM2 clustering
- Review memory leaks
- Increase instance memory
- Optimize database queries

### Socket.io Connection Failures

- Verify CORS configuration
- Check firewall rules
- Ensure WebSocket support
- Review transport configuration

---

## Backup & Disaster Recovery

### Database Backups

**Automated Backup Script:**

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DB_NAME="saferide_db"

# Create backup
pg_dump -U postgres $DB_NAME > $BACKUP_DIR/backup_$DATE.sql

# Compress
gzip $BACKUP_DIR/backup_$DATE.sql

# Delete backups older than 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

**Cron Job:**
```bash
# Run daily at 2 AM
0 2 * * * /path/to/backup.sh
```

### Backup Storage

- Store backups off-site (AWS S3, Google Cloud Storage)
- Encrypt backups
- Test restore procedures regularly

### Disaster Recovery Plan

1. **Identify**: Critical systems and data
2. **Backup**: Automated backups
3. **Test**: Regular restore testing
4. **Document**: Recovery procedures
5. **Monitor**: Backup health

---

## Cost Optimization

### Cloud Platform Costs

**Optimize:**
- Use appropriate instance sizes
- Enable auto-scaling
- Use reserved instances (AWS)
- Monitor and optimize database queries
- Clean up unused resources

### Database Costs

- Use connection pooling
- Optimize queries
- Archive old data
- Use read replicas strategically

### Monitoring Costs

- Use free tier monitoring tools
- Set up cost alerts
- Review and optimize resource usage

---

## Additional Resources

- [Node.js Production Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Sentry Documentation](https://docs.sentry.io/)

---

**Last Updated:** January 2024  
**Deployment Guide Version:** 1.0.0

