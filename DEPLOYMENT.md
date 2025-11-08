# VoxFlow Deployment Guide

## Environment Configuration

VoxFlow is designed to work seamlessly across different environments with smart port detection.

### 🚀 Quick Start

#### Local Development (Port 3000)
```bash
npm run start:dev
# or
npm run dev
```

#### Production at realway.com (Port 8080)
```bash
npm run start:prod
```

### 🔧 Environment Files

- **`.env.development`** - Local development (port 3000)
- **`.env.production`** - Production at realway.com (port 8080)
- **`.env`** - Current active environment (auto-copied by scripts)

### 🌐 WebSocket URLs

The system automatically detects the correct WebSocket URLs based on environment:

#### Development
- **Server Port**: 3000
- **WebSocket URL**: `ws://localhost:3000/ws`
- **Monitor URL**: `http://localhost:3000/api/monitor`

#### Production (realway.com)
- **Server Port**: 8080
- **WebSocket URL**: `ws://your-domain:8080/ws`
- **Monitor URL**: `http://your-domain:8080/api/monitor`

## 📋 Ozonetel Integration

### For Development Testing
```
WebSocket URL: ws://localhost:3000/ws
```

### For Production at realway.com
```
WebSocket URL: ws://your-realway-domain:8080/ws
```

## 🔄 Environment Switching

The application uses smart defaults:
- **NODE_ENV=development** → Port 3000
- **NODE_ENV=production** → Port 8080
- **Environment variables** override defaults

### Manual Environment Setup

1. **Development**:
   ```bash
   cp .env.development .env
   NODE_ENV=development npm start
   ```

2. **Production**:
   ```bash
   cp .env.production .env
   NODE_ENV=production npm start
   ```

## 🏗️ Production Deployment Steps

1. **Copy production environment**:
   ```bash
   cp .env.production .env
   ```

2. **Update production URLs** in `.env`:
   ```bash
   STREAM_WS_URL=ws://your-realway-domain:8080/ws
   STREAMING_WS_URL=ws://your-realway-domain:8080/ws
   VOXFLOW_URL=http://your-realway-domain:8080
   ```

3. **Start production server**:
   ```bash
   NODE_ENV=production npm start
   ```

## 🔍 Verification

### Check Current Configuration
```bash
curl http://localhost:PORT/api/monitor | jq '.server'
```

### WebSocket Connection Test
```bash
curl http://localhost:PORT/api/hearing/status
```

### Health Check
```bash
curl http://localhost:PORT/api/hearing/health
```

## 🚨 Important Notes

- **Default Ports**: 3000 (dev), 8080 (prod)
- **Smart Detection**: Automatically uses correct URLs based on NODE_ENV
- **Environment Override**: Environment variables always take precedence
- **Backward Compatibility**: Works with existing realway.com:8080 setup

## 📞 Support

If you encounter any issues:
1. Check the monitor API: `/api/monitor`
2. Verify environment: Check `NODE_ENV` and `PORT`
3. Test WebSocket: Use `/api/hearing/status`