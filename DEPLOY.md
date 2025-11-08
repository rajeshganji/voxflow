# VoxFlow - Railway Deployment Guide

## 🚀 Quick Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template)

## 📋 Pre-deployment Checklist

✅ Node.js application with Express server  
✅ WebSocket support for real-time communication  
✅ Static file serving configured  
✅ Environment variables configured  
✅ Dockerfile created  
✅ Railway.json configuration  

## 🛠️ Deployment Steps

### 1. Connect to Railway

1. Go to [Railway.app](https://railway.app)
2. Sign up/Login with GitHub
3. Click "New Project"
4. Choose "Deploy from GitHub repo"
5. Select your VoxFlow repository

### 2. Railway will automatically:

- Detect the Node.js application
- Install dependencies with `npm ci`
- Start the application with `npm start`
- Assign a public URL

### 3. Environment Variables

Railway automatically provides:
- `PORT` - The port your app should listen on
- `RAILWAY_PUBLIC_DOMAIN` - Your app's public domain
- `NODE_ENV` - Set to "production"

### 4. Access Your Application

After deployment, Railway will provide URLs:

- **Main App**: `https://your-app-name.railway.app`
- **Designer**: `https://your-app-name.railway.app/api/designer`
- **IVR Executer**: `https://your-app-name.railway.app/api/ivrexecuter`
- **Flow JSON Viewer**: `https://your-app-name.railway.app/flowJsonView`

## 🔧 Configuration

The app is already configured for Railway with:

- Dynamic port binding (`process.env.PORT`)
- Automatic HTTPS/WSS detection
- Production logging
- Health checks
- File persistence in Railway volumes

## 📊 Features Available

✅ **Visual Flow Designer** - Drag & drop IVR design  
✅ **Real-time Collaboration** - WebSocket connections  
✅ **Flow Persistence** - JSON-based flow storage  
✅ **Property Editor** - Node configuration panel  
✅ **Connection Management** - Visual flow connections  
✅ **JSON Viewer** - Flow structure inspection  

## 🐛 Troubleshooting

### If deployment fails:

1. Check the build logs in Railway dashboard
2. Ensure all dependencies are in package.json
3. Verify the start command is correct
4. Check for any missing environment variables

### If WebSocket doesn't work:

- Railway supports WebSockets by default
- The app automatically uses WSS for HTTPS connections
- Check browser console for connection errors

## 📞 IVR Integration

The deployed app provides KooKoo-compatible XML responses for:

- Voice call handling
- DTMF input processing
- Call transfer operations
- Audio playback control

Access the IVR endpoints at:
- `https://your-app-name.railway.app/api/ivrexecuter`

## 🔒 Security

The application includes:

- Helmet.js security headers
- CORS protection
- CSP (Content Security Policy)
- Input validation
- XSS prevention

## 📈 Monitoring

Railway provides built-in monitoring for:

- Application logs
- Resource usage
- Uptime monitoring
- Performance metrics

Access via Railway dashboard.