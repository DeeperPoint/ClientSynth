#!/bin/bash

# Local Development Setup Script
# This script sets up the local development environment with Docker Compose

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Setting up ClientSynth Local Development Environment${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠️  pnpm is not installed. Installing pnpm...${NC}"
    npm install -g pnpm
fi

echo -e "${BLUE}📦 Installing dependencies...${NC}"
pnpm install

echo -e "${BLUE}🐳 Starting Docker services...${NC}"
docker compose up -d postgres redis

echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
sleep 10

echo -e "${BLUE}🗄️  Running database migrations...${NC}"
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/clientsynth"
pnpm db:migrate

echo -e "${BLUE}✅ Setup completed!${NC}"
echo ""
echo -e "${GREEN}🎉 Local development environment is ready!${NC}"
echo ""
echo -e "${BLUE}Available commands:${NC}"
echo -e "  ${YELLOW}pnpm dev${NC}                    - Start development server"
echo -e "  ${YELLOW}pnpm db:migrate${NC}            - Run database migrations"
echo -e "  ${YELLOW}pnpm db:status${NC}             - Check database status"
echo -e "  ${YELLOW}docker compose logs${NC}        - View service logs"
echo -e "  ${YELLOW}docker compose down${NC}        - Stop services"
echo ""
echo -e "${BLUE}Database connection:${NC}"
echo -e "  Host: localhost"
echo -e "  Port: 5432"
echo -e "  Database: clientsynth"
echo -e "  Username: postgres"
echo -e "  Password: postgres"
echo ""
echo -e "${BLUE}Application:${NC}"
echo -e "  URL: http://localhost:3000"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"
