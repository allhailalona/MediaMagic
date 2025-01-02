<div align="center">
  
![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Ant Design](https://img.shields.io/badge/Ant%20Design-0170FE?style=for-the-badge&logo=ant-design&logoColor=white)

</div>

# MediaMagic

A desktop application for efficient media file conversion, supporting various formats of video, audio, and images.

<div align="center">
  <img src="./assets/new_output.gif" alt="Description of GIF" />
</div>

## Status

⚠️ Currently available in development mode only due to ongoing integration issues with FFmpeg binaries in the production build.
⚠️ A white screen might sometimes be opened with the main app for no reason... Couldn't solve it.

## Platform Support

- ✅ Windows: Fully tested and supported
- ⚡ Linux/MacOS: Not yet tested

## Prerequisites

1. FFmpeg installation required:

- Using Chocolatey (Windows):
  ```bash
  choco install ffmpeg
  ```
- Or download directly from [FFmpeg official website](https://ffmpeg.org/download.html)

## Development Setup

1. Clone the repository:

```bash
git clone https://github.com/allhailalona/MediaMagic.git
```

2. Install dependencies

```bash
npm install
```

3. Run in Devlopment mode

```bash
npm run dev
```

Or in Preview mode

```bash
npm start
```

## **FFmpeg Binaries Path Resolution Issue**

### Issue

FFmpeg/FFprobe binaries not found in production build (ENOENT error). Works in development but fails in production.

### Relevant Files

**src/main/utils.ts**

```typescript
export const getFFmpegPath = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
  } else {
    return path.join(app.getAppPath(), 'resources', 'bin', 'ffmpeg.exe')
  }
}
```

**src/main/index.ts**

```typescript
// Set FFmpeg and FFprobe paths globally
ffmpeg.setFfmpegPath(getFFmpegPath())
ffmpeg.setFfprobePath(getFFprobePath())
```

**package.json (build section)**

```json
"build": {
  "files": [
    "out/**/*",
    "resources/**/*"
  ],
  "extraResources": [
    {
      "from": "./resources/bin/",
      "to": "bin/",
      "filter": ["**/*"]
    }
  ]
}
```
