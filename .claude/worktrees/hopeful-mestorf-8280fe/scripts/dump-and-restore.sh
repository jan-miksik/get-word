#!/bin/bash

# Script to dump local Supabase database and restore to remote Supabase
# This is simpler than the TypeScript migration script - just pure SQL dump/restore

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Supabase Database Dump & Restore${NC}\n"

# Load environment variables
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
else
  echo -e "${RED}❌ .env.local file not found${NC}"
  exit 1
fi

# Local Supabase connection (default)
LOCAL_DB_URL="${LOCAL_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

# Remote Supabase connection
REMOTE_DB_URL="${DATABASE_URL}"

if [ -z "$REMOTE_DB_URL" ]; then
  echo -e "${RED}❌ DATABASE_URL not set in .env.local${NC}"
  exit 1
fi

# Check if using pooler connection (warn user)
if echo "$REMOTE_DB_URL" | grep -q "pooler\|pool"; then
  echo -e "${YELLOW}⚠️  WARNING: You're using a connection pooler URL${NC}"
  echo -e "${YELLOW}   For pg_dump/psql operations, use the DIRECT connection string instead.${NC}"
  echo -e "${YELLOW}   Get it from: Supabase Dashboard → Settings → Database → Connection String → Direct Connection${NC}\n"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Cancelled. Please update DATABASE_URL in .env.local with the direct connection string.${NC}"
    exit 0
  fi
fi

# Temporary dump file
DUMP_FILE="supabase_dump_$(date +%Y%m%d_%H%M%S).sql"

echo -e "${BLUE}📥 Step 1: Dumping local database...${NC}"
echo -e "   Local: ${LOCAL_DB_URL}\n"

# Try to find the Supabase container (project_id from config.toml is "wordlink")
SUPABASE_CONTAINER=$(docker ps --filter "name=supabase_db_wordlink" --format "{{.Names}}" | head -n 1)

# Use pg_dump from Docker container if available (to match PostgreSQL version)
# Otherwise fall back to system pg_dump
if [ -n "$SUPABASE_CONTAINER" ]; then
  echo -e "${BLUE}   Using pg_dump from Supabase container: ${SUPABASE_CONTAINER}${NC}\n"
  # Dump the database (data only, no schema - assuming schema is already on remote)
  # Use --data-only to only dump data, or remove it to dump schema + data
  docker exec "$SUPABASE_CONTAINER" pg_dump \
    -U postgres \
    -d postgres \
    --data-only \
    --no-owner \
    --no-acl \
    --column-inserts \
    --table=words \
    --table=users \
    --table=user_progress \
    --table=user_memory_hooks \
    --table=user_category_filters \
    > "$DUMP_FILE"
else
  echo -e "${YELLOW}   Container not found, using system pg_dump${NC}"
  echo -e "${YELLOW}   (Note: Version mismatch may cause issues)${NC}\n"
  # Dump the database (data only, no schema - assuming schema is already on remote)
  # Use --data-only to only dump data, or remove it to dump schema + data
  pg_dump "$LOCAL_DB_URL" \
    --data-only \
    --no-owner \
    --no-acl \
    --column-inserts \
    --table=words \
    --table=users \
    --table=user_progress \
    --table=user_memory_hooks \
    --table=user_category_filters \
    > "$DUMP_FILE"
fi

if [ $? -eq 0 ]; then
  DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
  echo -e "${GREEN}✓ Dump created: ${DUMP_FILE} (${DUMP_SIZE})${NC}\n"
else
  echo -e "${RED}❌ Dump failed${NC}"
  exit 1
fi

echo -e "${BLUE}📤 Step 2: Restoring to remote Supabase...${NC}"
echo -e "   Remote: ${REMOTE_DB_URL}\n"

# Restore to remote database
psql "$REMOTE_DB_URL" < "$DUMP_FILE"

if [ $? -eq 0 ]; then
  echo -e "\n${GREEN}✅ Restore completed successfully!${NC}\n"
  echo -e "${YELLOW}💡 Tip: You can delete ${DUMP_FILE} if you don't need it anymore${NC}"
else
  echo -e "\n${RED}❌ Restore failed${NC}"
  echo -e "${YELLOW}💡 The dump file ${DUMP_FILE} is still available for manual restore${NC}"
  exit 1
fi
